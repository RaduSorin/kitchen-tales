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
import { groupFolders, SCENES, sceneIndex } from '../lib/stories'
import CoverScene from '../components/CoverScene'
import Sheet from '../components/Sheet'
import { fmtTime } from '../lib/stories'
import AddArt, { type AddArtKind } from '../components/AddArt'
import { guardedWorkDone, useLeaveGuard } from '../lib/leaveGuard'
import { showToast } from '../lib/toast'

const LEAVE_UNSAVED = {
  title: 'Pleci fără să salvezi?',
  text: 'Înregistrarea ta nu e salvată încă. Dacă pleci acum, se pierde.',
  stay: 'Rămân să o salvez',
  leave: 'Pleacă și renunță',
}
const LEAVE_GENERATED = { ...LEAVE_UNSAVED, text: 'Povestea creată nu e pusă pe raft încă. Dacă pleci acum, se pierde.' }

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

/** A small player for the finished story: gold play button, a bar you can drag, the time. */
function PreviewPlayer({ src, onDuration }: { src: string; onDuration: (s: number) => void }) {
  const el = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [dur, setDur] = useState(0)
  return (
    <div className="fin-player">
      <audio ref={el} src={src} preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) { setDur(d); onDuration(d) } }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <button type="button" className="fin-play" aria-label={playing ? 'Pauză' : 'Ascultă'} onClick={() => { const a = el.current; if (a) { if (a.paused) a.play().catch(() => {}); else a.pause() } }}>
        {playing
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
      </button>
      <div className="fin-track">
        <input type="range" min={0} max={dur || 1} step={0.1} value={at} aria-label="Poziția în poveste" style={{ ['--p' as string]: `${dur ? (at / dur) * 100 : 0}%` }}
          onChange={(e) => { const a = el.current; if (a) { a.currentTime = +e.target.value; setAt(+e.target.value) } }} />
        <div className="fin-times"><span>{fmtTime(at)}</span><span>{dur ? `-${fmtTime(Math.max(0, dur - at))}` : ''}</span></div>
      </div>
    </div>
  )
}

export default function StoryAdd() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = (['record', 'create', 'upload'] as const).find((m) => m === params.get('mod'))
  const { child } = useSettings()
  // Name, age and girl/boy come from the child's profile in Settings; the form only asks for what's missing there.
  const known = { childName: child.name.trim() || undefined, age: childAge(child), gender: child.gender }
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  // The drawn cover's colours; undefined until picked (then the title decides, as before).
  const [scene, setScene] = useState<number>()
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
  const [textOpen, setTextOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ text: string; audioKey: string; url: string }>()
  const preview = generated?.url ?? localPreview
  // What's ready belongs to the screen that made it, so switching screens shows that screen's own start.
  const ready = !!(audio || generated) && mode === MODE_OF[source]
  // A finished recording, or a story the app just wrote and read, isn't saved yet: leaving
  // (the ‹ button, the tab bar, the iPhone swipe back) asks first.
  useLeaveGuard(ready && !saving && (source === 'recording' || source === 'generated'), source === 'generated' ? LEAVE_GENERATED : LEAVE_UNSAVED)

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
      const id = await createStory({ title: title.trim(), emoji, scene: coverKey ? undefined : scene ?? sceneIndex(title.trim()), coverKey, collection: collection || undefined, shared: share, source, audioKey, text: generated?.text, durationSec: seconds ? Math.round(seconds) : undefined })
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
    // From the finish screen one step back: the recorder, the story's details or the file picker
    // again, and what wasn't saved is let go (so nothing asks again later).
    else if (ready) reset()
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
  const uploadStart = mode === 'upload' && !ready
  const finishing = !!mode && ready
  const head = (
    <div className={`parent-head${recordStart || uploadStart || finishing ? ' stacked' : ''}`}>
      <button type="button" className="night-btn" aria-label="Înapoi" data-leaves="" onClick={() => (mode ? back() : nav('/povesti'))}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div>
        <span className="pbadge">{recordStart ? 'Citește tu' : uploadStart ? 'Încarcă un fișier' : finishing ? TITLES[mode] : 'Mod părinte'}</span>
        <h1>{recordStart ? 'Ia cartea și citește cu glas tare' : uploadStart ? 'Adaugă o poveste de pe telefon' : finishing ? 'Aproape gata' : mode ? TITLES[mode] : 'Poveste nouă'}</h1>
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
          <span className="drop-ic"><Icon d="M12 15V4M7 9l5-5 5 5M5 20h14" /></span>
          <b>Alege un fișier audio</b>
          <small>MP3, M4A sau WAV</small>
          <input type="file" accept="audio/*" onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pickFile(f)
          }} />
        </label>
      )}
      {mode === 'upload' && !ready && (
        <p className="drop-note">Titlul și coperta le luăm din fișier, dacă le are. Le poți schimba înainte să salvezi.</p>
      )}

      {mode === 'create' && !ready && generating && (
        <p className="importing"><span className="spinner" /> Scriu și înregistrez povestea… durează cam un minut.</p>
      )}

      {ready && (
        <div className="add-finish">
          {/* The story as it will look: cover, title (tap to change) and a small player to listen first. */}
          <div className="fin-hero">
            <StoryCover story={{ title: title || 'Poveste', emoji, scene }} src={coverUrl} className="fin-cover" />
            <label className="fin-title">
              <span className="sr-only">Titlul poveștii</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titlul poveștii" />
            </label>
            <small className="fin-sub">{source === 'recording' ? 'vocea noastră' : source === 'generated' ? 'poveste nouă' : fileName || 'fișierul tău'} · atinge titlul ca să-l schimbi</small>
            {preview && <PreviewPlayer src={preview} onDuration={setSeconds} />}
            <div className="fin-links">
              <button type="button" className="fin-chip" onClick={reset}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
                {source === 'recording' ? 'Înregistrează din nou' : source === 'generated' ? 'Schimbă detaliile' : 'Alt fișier'}
              </button>
              {generated && (
                <button type="button" className="fin-chip" onClick={() => setTextOpen(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h10M5 18h7" /></svg>
                  Textul poveștii
                </button>
              )}
            </div>
          </div>

          <div className="set-group">
            <h2 className="fin-label">Coperta</h2>
            <div className="fin-cover-actions">
              <label className="fin-chip file-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01" /></svg>
                {cover ? 'Altă poză' : 'Alege o poză'}
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = '' }} />
              </label>
              {cover && <button type="button" className="fin-chip" onClick={() => setCover(undefined)}>Folosește un desen</button>}
            </div>
            {cover && <small className="fin-note">{cover.from === 'file' ? 'Am găsit-o în fișier.' : cover.from === 'web' ? 'Găsită pe internet.' : 'Poza aleasă de tine.'}</small>}
            {cover?.from !== 'file' && cover?.from !== 'photo' && (
              <CoverSearch key={`${source}-${fileName}`} title={title} artist={artist} auto={autoSearch} chosen={cover?.url}
                onPick={(c) => setCover({ url: c.url, from: 'web' })} />
            )}
            {!cover && (
              <div className="emoji-pick fin-emoji" role="group" aria-label="Desenul de pe copertă">
                {EMOJIS.map((x) => <button type="button" key={x} className={x === emoji ? 'on' : ''} aria-pressed={x === emoji} onClick={() => setEmoji(x)}>{x}</button>)}
              </div>
            )}
            {!cover && (
              <div className="fin-scenes" role="radiogroup" aria-label="Culorile copertei">
                {SCENES.map((_, i) => {
                  const on = (scene ?? sceneIndex(title || 'Poveste')) === i
                  return (
                    <button type="button" key={i} role="radio" aria-checked={on} aria-label={`Culorile ${i + 1}`} className={on ? 'on' : undefined} onClick={() => setScene(i)}>
                      <CoverScene title="" scene={i} />
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="set-group">
            <h2 className="fin-label">Pe raft</h2>
            <div className="set-box fin-box">
              {folderNames.length > 0 && (
                <label className="set-row">
                  <span>Folderul</span>
                  <select value={collection} onChange={(e) => { setCollection(e.target.value); setShareChoice(undefined) }}>
                    <option value="">Automat</option>
                    {[...new Set([...folderNames, ...(collection ? [collection] : [])])].sort((a, b) => a.localeCompare(b, 'ro')).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <label className="set-row">
                <span>Partajată cu toate conturile<small className="set-sub">{share ? 'O văd toți cei care au cont în aplicație' : 'Doar în spațiul nostru'}</small></span>
                <input type="checkbox" className="switch" checked={share} onChange={(e) => setShareChoice(e.target.checked)} />
              </label>
            </div>
            {source !== 'generated' && <p className="fin-note">Se salvează și pe acest dispozitiv, merge și fără internet.</p>}
          </div>

          {error && <p className="error">{error}</p>}
          <div className="cs-foot">
            <button className="moon-btn" type="submit" disabled={saving || !title.trim()}>{saving ? (sent !== undefined && sent < 1 ? `Se încarcă… ${Math.round(sent * 100)}%` : 'Se salvează…') : 'Pune pe raft'}</button>
            {saving && sent !== undefined && sent < 1 && <progress className="upload-progress" max={1} value={sent} aria-label="Încărcare" />}
          </div>
          {textOpen && generated && <Sheet title="Textul poveștii" onClose={() => setTextOpen(false)}><p className="story-text-body">{generated.text}</p></Sheet>}
        </div>
      )}
      {!ready && error && <p className="error">{error}</p>}
    </form>
  )
}
