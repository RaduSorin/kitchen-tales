import { useEffect, useRef, useState } from 'react'
import { errorText } from '../lib/errors'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { cachedFolders, createStory, fileUrl, listFolders, listStories, generateStory, removeFile, saveFoundCover, uploadFile, type StoryBrief } from '../lib/db'
import { saveAudio, saveCover } from '../lib/offline'
import { readAudioMeta } from '../lib/audioMeta'
import { resizeImage } from '../lib/resizeImage'
import type { StorySource } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { childAge, useSettings } from '../lib/settings'
import Recorder from '../components/Recorder'
import StoryCover from '../components/StoryCover'
import CoverSearch from '../components/CoverSearch'
import { groupFolders } from '../lib/stories'
import ShareIcon from '../components/ShareIcon'
import AddArt, { type AddArtKind } from '../components/AddArt'
import { guardedWorkDone, useLeaveGuard } from '../lib/leaveGuard'
import { showToast } from '../lib/toast'

const LEAVE_UNSAVED = {
  title: 'Pleci fără să salvezi?',
  text: 'Înregistrarea ta nu e salvată încă. Dacă pleci acum, se pierde.',
  stay: 'Rămân să o salvez',
  leave: 'Pleacă și renunță',
}

const BRIEF_KEY = 'kt-story-brief'
const loadBrief = (): StoryBrief => {
  let saved: StoryBrief = {}
  try { saved = JSON.parse(localStorage.getItem(BRIEF_KEY) ?? '{}') } catch { /* ignore */ }
  return saved
}
const saveBrief = (b: StoryBrief) => {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify({ childName: b.childName, gender: b.gender, age: b.age, length: b.length })) } catch { /* ignore */ }
}
const AGES = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const TOPICS = ['animale', 'prietenie', 'curaj', 'pădurea', 'marea', 'spațiu', 'dragoni', 'somn']
const LENGTHS = [['short', '2 min'], ['medium', '4 min'], ['long', '7 min']] as const
const EMOJIS = ['🐻', '🦊', '🐰', '🦁', '🐉', '🧚', '👑', '🚀', '🌙', '⭐', '🐢', '🦄']

type Mode = 'record' | 'create' | 'upload'
type Step = 'who' | 'topic' | 'length' | 'title'
const LENGTH_NOTE: Record<string, string> = { short: 'Scurtă, pentru când e deja somnoros', medium: 'Cât o poveste obișnuită de culcare', long: 'Pentru o seară fără grabă' }
const MODE_OF: Record<StorySource, Mode> = { recording: 'record', generated: 'create', upload: 'upload' }
const TITLES: Record<Mode, string> = { record: 'Citește tu', create: 'Creează o poveste', upload: 'Încarcă un fișier' }

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
// Creating comes first: it is the one that needs nothing ready.
const OPTIONS: { mode: Mode; art: AddArtKind; text: string }[] = [
  { mode: 'create', art: 'create', text: 'Spui eroul și tema, aplicația o scrie și o citește' },
  { mode: 'record', art: 'record', text: 'Înregistrează-ți vocea citind o carte' },
  { mode: 'upload', art: 'upload', text: 'MP3 sau M4A de pe telefon sau calculator' },
]

export default function StoryAdd() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = (['record', 'create', 'upload'] as const).find((m) => m === params.get('mod'))
  const { child } = useSettings()
  // Name, age and girl/boy come from the child's profile in Settings; the form only asks for what's missing there.
  const known = { childName: child.name.trim() || undefined, age: childAge(child), gender: child.gender }
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  // Cover picture: found inside the audio file, found online by title, or a photo the parent picked. The emoji is the fallback.
  const [cover, setCover] = useState<{ blob?: Blob; url?: string; from: 'file' | 'photo' | 'web' }>()
  const coverBlobUrl = useBlobUrl(cover?.blob)
  const coverUrl = cover?.url ?? coverBlobUrl
  const [artist, setArtist] = useState<string>()
  const [autoSearch, setAutoSearch] = useState(false)
  const [audio, setAudio] = useState<Blob>()
  const [fileName, setFileName] = useState('')
  const [source, setSource] = useState<StorySource>('upload')
  const [seconds, setSeconds] = useState<number>()
  const [error, setError] = useState('')
  // The shelf folder for the new story: opened from a folder, it goes there; '' = by how it was made.
  const [collection, setCollection] = useState(params.get('folder') ?? '')
  const [folderNames, setFolderNames] = useState(() => cachedFolders().filter((f) => f.mine !== false).map((f) => f.name))
  // Who sees the new story: what the parent picked, else the folder's sharing, else every account.
  const [shareChoice, setShareChoice] = useState<boolean>()
  const folderShared = collection ? cachedFolders().find((f) => f.mine !== false && f.name === collection)?.shared : undefined
  const share = shareChoice ?? folderShared ?? true
  useEffect(() => {
    Promise.all([listStories(), listFolders()])
      // Only our own folders: a folder another space shared can't take new stories.
      .then(([stories, rows]) => setFolderNames(groupFolders(stories, rows).filter((f) => !f.builtin && f.mine).map((f) => f.name)))
      .catch(() => {})
  }, [])
  const [saving, setSaving] = useState(false)
  // Share of the audio sent so far while saving (big files take a while on mobile data).
  const [sent, setSent] = useState<number>()
  const localPreview = useBlobUrl(audio)
  const [brief, setBrief] = useState<StoryBrief>(() => ({ length: 'medium', ...loadBrief() }))
  const setB = <K extends keyof StoryBrief>(k: K, v: StoryBrief[K]) => setBrief((b) => ({ ...b, [k]: v }))
  const [topics, setTopics] = useState<string[]>([])
  const [ownText, setOwnText] = useState('')
  // "Creează o poveste" asks one thing per screen: (who, if the profile doesn't say,) what about,
  // how long, and a title that can stay empty. "Am deja textul" is a screen of its own.
  const needsWho = !(known.childName && known.age && known.gender)
  const steps: Step[] = [...(needsWho ? ['who' as const] : []), 'topic', 'length', 'title']
  const [stepAt, setStepAt] = useState(0)
  const step: Step = steps[Math.min(stepAt, steps.length - 1)]
  const [ownMode, setOwnMode] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ text: string; audioKey: string; url: string }>()
  const preview = generated?.url ?? localPreview
  // What's ready belongs to the screen that made it, so switching screens shows that screen's own start.
  const ready = !!(audio || generated) && mode === MODE_OF[source]
  // A finished recording that isn't saved yet only lives on this screen, so leaving asks first.
  useLeaveGuard(source === 'recording' && !!audio && !saving, LEAVE_UNSAVED)

  // A generated story's audio is already in the cloud: leaving without saving deletes it.
  const unsavedAudio = useRef<string>(undefined)
  useEffect(() => { unsavedAudio.current = generated?.audioKey }, [generated])
  useEffect(() => () => { if (unsavedAudio.current) removeFile(unsavedAudio.current).catch(() => {}) }, [])

  const choose = (m?: Mode) => {
    setError('')
    const folder = params.get('folder')
    setParams({ ...(m ? { mod: m } : {}), ...(folder ? { folder } : {}) })
  }
  const reset = () => {
    if (generated) removeFile(generated.audioKey).catch(() => {})
    setAudio(undefined); setGenerated(undefined); setSeconds(undefined); setFileName('')
    setCover((c) => (c?.from === 'photo' ? c : undefined))
    setArtist(undefined); setAutoSearch(false)
  }

  const pickFile = async (f: File) => {
    reset(); setAudio(f); setFileName(f.name); setSource('upload')
    const fromName = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
    if (!title.trim()) setTitle(fromName)
    const meta = await readAudioMeta(f)
    // The title inside the file is usually nicer than the file name, so use it unless the parent typed one.
    if (meta.title) setTitle((t) => (!t.trim() || t === fromName ? meta.title! : t))
    setArtist(meta.artist)
    if (meta.picture) setCover({ blob: meta.picture, from: 'file' })
    else setAutoSearch(true) // no picture inside: look one up by title
  }

  const pickPhoto = async (f: File) => {
    try { setCover({ blob: await resizeImage(f, 800, 0.85), from: 'photo' }) } catch { setError('Nu am putut citi poza.') }
  }

  const generate = async (useOwnText: boolean) => {
    const prompt = [...topics, brief.prompt?.trim()].filter(Boolean).join(', ')
    // No title typed: one from the first topic (the parent can change it before saving).
    const about = useOwnText ? '' : topics[0] ?? brief.prompt?.trim()
    const name = title.trim() || (about ? `O poveste despre ${about}` : 'O poveste nouă')
    setTitle(name)
    setGenerating(true); setError('')
    try {
      if (generated) await removeFile(generated.audioKey)
      if (!useOwnText) saveBrief(brief)
      const forChild = { childName: known.childName ?? brief.childName, age: known.age ?? brief.age, gender: known.gender ?? brief.gender }
      const g = await generateStory({ title: name, ...(useOwnText ? { text: ownText } : { ...brief, ...forChild, prompt }) })
      setGenerated({ ...g, url: await fileUrl(g.audioKey) })
      setAudio(undefined); setSource('generated'); setSeconds(undefined)
    } catch (err) {
      setError(`Nu am putut crea povestea: ${errorText(err)}`)
    }
    setGenerating(false)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Scrie un titlu pentru poveste.'); return }
    if (!ready) return
    setSaving(true); setError('')
    try {
      const audioKey = generated ? generated.audioKey : await uploadFile('stories', audio!, 'webm', setSent)
      let coverKey: string | undefined
      if (cover?.url) coverKey = await saveFoundCover(cover.url).catch(() => undefined)
      else if (cover?.blob) {
        const small = await resizeImage(cover.blob, 800, 0.85).catch(() => cover.blob!)
        coverKey = await uploadFile('story-covers', small, 'jpg')
        saveCover(coverKey, small).catch(() => {})
      }
      const id = await createStory({ title: title.trim(), emoji, coverKey, collection: collection || undefined, shared: share, source, audioKey, text: generated?.text, durationSec: seconds ? Math.round(seconds) : undefined })
      unsavedAudio.current = undefined // it belongs to the story now
      // Our own recordings and files are already on this device, so keep them for offline listening.
      if (audio) await saveAudio(id, audio).catch(() => {})
      await guardedWorkDone()
      nav(`/povesti/${id}`, { replace: true })
    } catch (err) {
      setError(`Nu am putut salva povestea: ${errorText(err)}`)
      setSaving(false); setSent(undefined)
    }
  }

  const creating = mode === 'create' && !ready && !generating
  const back = () => {
    setError('')
    if (creating && ownMode) setOwnMode(false)
    else if (creating && stepAt > 0) setStepAt(stepAt - 1)
    else choose()
  }
  if (creating) {
    const at = steps.indexOf(step)
    const next = () => { setError(''); setStepAt(at + 1) }
    const kicker = `Poveste nouă${(known.childName ?? brief.childName) ? ` pentru ${known.childName ?? brief.childName}` : ''}`
    const forChild = [known.childName, known.age && `${known.age} ${known.age === 1 ? 'an' : 'ani'}`, known.gender && (known.gender === 'girl' ? 'fetiță' : 'băiețel')].filter(Boolean).join(' · ')
    return (
      <div className="parent create-steps">
        <div className="cs-top">
          <button type="button" className="night-btn" aria-label={ownMode || at > 0 ? 'Pasul anterior' : 'Înapoi'} onClick={back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          {!ownMode && (
            <div className="cs-dots" role="img" aria-label={`Pasul ${at + 1} din ${steps.length}`}>
              {steps.map((x, i) => <span key={x} className={i === at ? 'on' : i < at ? 'done' : undefined} />)}
            </div>
          )}
          <span />
        </div>

        {ownMode ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Am deja textul</h1>
              <p>Lipește povestea, iar aplicația o citește cu voce tare.</p>
            </div>
            <textarea className="cs-text" rows={9} aria-label="Textul poveștii" value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="A fost odată…" />
            <label className="night-field">Titlul <small>(opțional)</small>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vulpița Fifi" />
            </label>
          </div>
        ) : step === 'who' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Poveste nouă</span>
              <h1>Pentru cine e povestea?</h1>
              <p>Completează în <Link to="/profil/copil">Profil</Link> și nu te mai întrebăm.</p>
            </div>
            {!known.childName && (
              <label className="night-field">Eroul poveștii
                <input value={brief.childName ?? ''} onChange={(e) => setB('childName', e.target.value)} placeholder="Ana" />
              </label>
            )}
            {!known.gender && (
              <div className="night-field">
                <span>Este</span>
                <div className="pills">
                  <button type="button" aria-pressed={brief.gender === 'girl'} onClick={() => setB('gender', brief.gender === 'girl' ? undefined : 'girl')}>fetiță</button>
                  <button type="button" aria-pressed={brief.gender === 'boy'} onClick={() => setB('gender', brief.gender === 'boy' ? undefined : 'boy')}>băiețel</button>
                </div>
              </div>
            )}
            {!known.age && (
              <div className="night-field">
                <span>Vârsta</span>
                <div className="pills">
                  {AGES.map((a) => <button type="button" key={a} aria-pressed={brief.age === a} onClick={() => setB('age', brief.age === a ? undefined : a)}>{a} ani</button>)}
                </div>
              </div>
            )}
          </div>
        ) : step === 'topic' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Despre ce să fie povestea?</h1>
              <p>Alege una sau mai multe.</p>
            </div>
            <div className="cs-tiles">
              {TOPICS.map((t) => {
                const on = topics.includes(t)
                return (
                  <button type="button" key={t} aria-pressed={on} onClick={() => setTopics((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}>
                    {on && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                    {t}
                  </button>
                )
              })}
            </div>
            <input className="cs-other" aria-label="Altceva" value={brief.prompt ?? ''} onChange={(e) => setB('prompt', e.target.value)} placeholder="Altceva? Ex.: prima zi de grădiniță" />
          </div>
        ) : step === 'length' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Cât de lungă?</h1>
            </div>
            <div className="cs-lengths" role="radiogroup" aria-label="Lungimea poveștii">
              {LENGTHS.map(([k, l]) => (
                <button type="button" key={k} role="radio" aria-checked={brief.length === k} onClick={() => setB('length', k)}>
                  <b>{l}</b><small>{LENGTH_NOTE[k]}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Cum se numește?</h1>
              <p>Opțional. Dacă lași gol, îi dăm noi un nume, și îl poți schimba după.</p>
            </div>
            <label className="night-field">
              <span className="sr-only">Titlul poveștii</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={topics[0] ? `O poveste despre ${topics[0]}` : 'Ursulețul curajos'} />
            </label>
            <div className="cs-summary">
              <span>{[topics.join(', ') || brief.prompt?.trim() || 'orice temă', LENGTHS.find(([k]) => k === brief.length)?.[1]].filter(Boolean).join(' · ')}</span>
              {forChild && <span>pentru {forChild} <Link to="/profil/copil">Schimbă</Link></span>}
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="cs-foot">
          {ownMode ? (
            <button type="button" className="moon-btn" disabled={!ownText.trim()} onClick={() => generate(true)}>Citește textul meu</button>
          ) : step === 'title' ? (
            <button type="button" className="moon-btn" onClick={() => generate(false)}>Creează povestea</button>
          ) : (
            <button type="button" className="moon-btn" onClick={next}>
              Mai departe <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          )}
          {!ownMode && step === 'topic' && <button type="button" className="link-btn cs-own" onClick={() => setOwnMode(true)}>Am deja textul poveștii ›</button>}
          {!ownMode && step !== 'title' && step !== 'topic' && <small className="cs-next">Urmează: {step === 'who' ? 'tema' : 'titlul (opțional)'}</small>}
        </div>
      </div>
    )
  }

  // "Citește tu" before the recording: the invitation as the title (the recorder takes the whole screen once it starts).
  const recordStart = mode === 'record' && !ready
  const head = (
    <div className={`parent-head${recordStart ? ' stacked' : ''}`}>
      <button type="button" className="night-btn" aria-label="Înapoi" data-leaves={mode === 'record' && !ready ? '' : undefined} onClick={() => (mode ? back() : nav('/povesti'))}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div>
        <span className="pbadge">{recordStart ? 'Citește tu' : 'Mod părinte'}</span>
        <h1>{recordStart ? 'Ia cartea și citește cu glas tare' : mode ? TITLES[mode] : 'Poveste nouă'}</h1>
      </div>
    </div>
  )

  if (!mode) {
    return (
      <div className="parent">
        {head}
        <p className="parent-sub">Apare pe raftul copilului imediat ce o salvezi.</p>
        <div className="add-opts">
          {OPTIONS.map((o) => (
            <button key={o.mode} type="button" className="add-opt" onClick={() => choose(o.mode)}>
              <AddArt kind={o.art} />
              <span><b>{TITLES[o.mode]}</b><small>{o.text}</small></span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <form className="parent" onSubmit={save}>
      {head}
      {(mode === 'upload' || ready) && <label className="night-field">Titlul poveștii
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'create' ? 'Ursulețul curajos' : 'Vulpița Fifi'} />
      </label>}

      {mode === 'record' && !ready && (
        <>
          <ul className="rec-tips">
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>Ține telefonul la o palmă de gură</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>Poți face pauză oricând și continui</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7" /></svg>Titlul și coperta le alegi la final</li>
          </ul>
          <Recorder onDone={(blob, s, interrupted) => {
            reset(); setAudio(blob); setSeconds(s); setSource('recording')
            if (interrupted) showToast('Înregistrarea s-a oprit, dar am păstrat ce ai citit până acum.')
          }} />
        </>
      )}

      {mode === 'upload' && !ready && (
        <label className="drop">
          <Icon d="M12 15V4M7 9l5-5 5 5M5 20h14" />
          <b>Alege un fișier audio</b>
          <small>MP3, M4A sau WAV</small>
          <input type="file" accept="audio/*" onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pickFile(f)
          }} />
        </label>
      )}

      {mode === 'create' && !ready && generating && (
        <p className="importing"><span className="spinner" /> Scriu și înregistrez povestea… durează cam un minut.</p>
      )}

      {ready && (
        <div className="add-finish">
          <div className="finish-audio">
            <span>{source === 'recording' ? 'Înregistrarea ta' : source === 'generated' ? 'Povestea nouă' : fileName || 'Fișierul tău'}</span>
            {preview && <audio controls src={preview} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setSeconds(d) }} />}
            <button type="button" className="link-btn" onClick={reset}>
              {source === 'recording' ? 'Înregistrează din nou' : source === 'generated' ? 'Schimbă detaliile' : 'Alt fișier'}
            </button>
          </div>
          {generated && <details className="story-text"><summary>Textul poveștii</summary><p>{generated.text}</p></details>}
          <div className="night-field">
            <span>Coperta</span>
            <div className="cover-pick">
              <StoryCover story={{ title: title || 'Poveste', emoji }} src={coverUrl} />
              <div className="cover-pick-actions">
                {cover && <small>{cover.from === 'file' ? 'Am găsit-o în fișier.' : cover.from === 'web' ? 'Găsită pe internet.' : 'Poza aleasă de tine.'}</small>}
                <label className="link-btn file-btn">{cover ? 'Altă poză' : 'Alege o poză'}
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = '' }} />
                </label>
                {cover && <button type="button" className="link-btn" onClick={() => setCover(undefined)}>Folosește un desen</button>}
              </div>
            </div>
            {cover?.from !== 'file' && cover?.from !== 'photo' && (
              <CoverSearch key={`${source}-${fileName}`} title={title} artist={artist} auto={autoSearch} chosen={cover?.url}
                onPick={(c) => setCover({ url: c.url, from: 'web' })} />
            )}
            {!cover && (
              <div className="emoji-pick">
                {EMOJIS.map((x) => <button type="button" key={x} className={x === emoji ? 'on' : ''} aria-pressed={x === emoji} onClick={() => setEmoji(x)}>{x}</button>)}
              </div>
            )}
          </div>
          {folderNames.length > 0 && (
            <label className="night-field">Folderul
              <select className="night-select" value={collection} onChange={(e) => { setCollection(e.target.value); setShareChoice(undefined) }}>
                <option value="">Automat, după cum a fost făcută</option>
                {[...new Set([...folderNames, ...(collection ? [collection] : [])])].sort((a, b) => a.localeCompare(b, 'ro')).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn small share-toggle add-share" aria-pressed={share} onClick={() => setShareChoice(!share)}>
            <ShareIcon shared={share} />
            {share ? 'Partajată cu toate conturile' : 'Doar în spațiul nostru'}
            <span className="sr-only">. Apasă ca să schimbi.</span>
          </button>
          <button className="moon-btn" type="submit" disabled={saving || !title.trim()}>{saving ? (sent !== undefined && sent < 1 ? `Se încarcă… ${Math.round(sent * 100)}%` : 'Se salvează…') : 'Pune pe raft'}</button>
          {saving && sent !== undefined && sent < 1 && <progress className="upload-progress" max={1} value={sent} aria-label="Încărcare" />}
          {source !== 'generated' && <p className="rec-hint">Se salvează și pe acest dispozitiv, merge și fără internet.</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
