import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createStory, fileUrl, generateStory, removeFile, saveFoundCover, uploadFile, type StoryBrief } from '../lib/db'
import { saveAudio, saveCover } from '../lib/offline'
import { readAudioMeta } from '../lib/audioMeta'
import { resizeImage } from '../lib/resizeImage'
import type { StorySource } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { getSettings, useSettings } from '../lib/settings'
import Recorder from '../components/Recorder'
import StoryCover from '../components/StoryCover'
import CoverSearch from '../components/CoverSearch'

const BRIEF_KEY = 'kt-story-brief'
const loadBrief = (): StoryBrief => {
  let saved: StoryBrief = {}
  try { saved = JSON.parse(localStorage.getItem(BRIEF_KEY) ?? '{}') } catch { /* ignore */ }
  // The child's profile in Settings is the source of truth for name, age and gender.
  const { child } = getSettings()
  return { ...saved, childName: child.name || saved.childName, age: child.age ?? saved.age, gender: child.gender ?? saved.gender }
}
const saveBrief = (b: StoryBrief) => {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify({ childName: b.childName, gender: b.gender, age: b.age, length: b.length })) } catch { /* ignore */ }
}
const AGES = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const TOPICS = ['animale', 'prietenie', 'curaj', 'pădurea', 'marea', 'spațiu', 'dragoni', 'somn']
const LENGTHS = [['short', '2 min'], ['medium', '4 min'], ['long', '7 min']] as const
const EMOJIS = ['🐻', '🦊', '🐰', '🦁', '🐉', '🧚', '👑', '🚀', '🌙', '⭐', '🐢', '🦄']

type Mode = 'record' | 'create' | 'upload'
const MODE_OF: Record<StorySource, Mode> = { recording: 'record', generated: 'create', upload: 'upload' }
const TITLES: Record<Mode, string> = { record: 'Citește tu', create: 'Creează o poveste', upload: 'Încarcă un fișier' }

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#171a45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const OPTIONS: { mode: Mode; color: string; icon: string; text: string }[] = [
  { mode: 'record', color: '#ff9fb8', icon: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3', text: 'Înregistrează-ți vocea citind o carte' },
  { mode: 'create', color: '#ffd76a', icon: 'M12 3l2.2 5.5L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.5z', text: 'Spui eroul și tema, aplicația o scrie și o citește' },
  { mode: 'upload', color: '#74e0d0', icon: 'M12 15V4M7 9l5-5 5 5M5 20h14', text: 'MP3 sau M4A de pe telefon sau calculator' },
]

export default function StoryAdd() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = (['record', 'create', 'upload'] as const).find((m) => m === params.get('mod'))
  const { child } = useSettings()
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
  const [saving, setSaving] = useState(false)
  const localPreview = useBlobUrl(audio)
  const [brief, setBrief] = useState<StoryBrief>(() => ({ length: 'medium', ...loadBrief() }))
  const setB = <K extends keyof StoryBrief>(k: K, v: StoryBrief[K]) => setBrief((b) => ({ ...b, [k]: v }))
  const [topics, setTopics] = useState<string[]>([])
  const [ownText, setOwnText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ text: string; audioKey: string; url: string }>()
  const preview = generated?.url ?? localPreview
  // What's ready belongs to the screen that made it, so switching screens shows that screen's own start.
  const ready = !!(audio || generated) && mode === MODE_OF[source]

  const choose = (m?: Mode) => {
    setError('')
    setParams(m ? { mod: m } : {})
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
    if (!title.trim()) { setError('Scrie întâi un titlu.'); return }
    setGenerating(true); setError('')
    try {
      if (generated) await removeFile(generated.audioKey)
      const prompt = [...topics, brief.prompt?.trim()].filter(Boolean).join(', ')
      if (!useOwnText) saveBrief(brief)
      const g = await generateStory({ title: title.trim(), ...(useOwnText ? { text: ownText } : { ...brief, prompt }) })
      setGenerated({ ...g, url: await fileUrl(g.audioKey) })
      setAudio(undefined); setSource('generated'); setSeconds(undefined)
    } catch (err) {
      setError(`Nu am putut crea povestea: ${(err as Error).message}`)
    }
    setGenerating(false)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Scrie un titlu pentru poveste.'); return }
    if (!ready) return
    setSaving(true); setError('')
    try {
      const audioKey = generated ? generated.audioKey : await uploadFile('stories', audio!, 'webm')
      let coverKey: string | undefined
      if (cover?.url) coverKey = await saveFoundCover(cover.url).catch(() => undefined)
      else if (cover?.blob) {
        const small = await resizeImage(cover.blob, 800, 0.85).catch(() => cover.blob!)
        coverKey = await uploadFile('story-covers', small, 'jpg')
        saveCover(coverKey, small).catch(() => {})
      }
      const id = await createStory({ title: title.trim(), emoji, coverKey, source, audioKey, text: generated?.text, durationSec: seconds ? Math.round(seconds) : undefined })
      // Our own recordings and files are already on this device, so keep them for offline listening.
      if (audio) await saveAudio(id, audio).catch(() => {})
      nav(`/povesti/${id}`, { replace: true })
    } catch (err) {
      setError(`Nu am putut salva povestea: ${(err as Error).message}`)
      setSaving(false)
    }
  }

  const head = (
    <div className="parent-head">
      <button type="button" className="night-btn" aria-label="Înapoi" onClick={() => (mode ? choose() : nav('/povesti'))}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div>
        <span className="pbadge">Mod părinte</span>
        <h1>{mode ? TITLES[mode] : 'Poveste nouă'}</h1>
      </div>
    </div>
  )

  if (!mode) {
    return (
      <div className="parent">
        {head}
        <p className="parent-sub">Poveștile noi apar pe raftul copilului imediat ce le salvezi.</p>
        <div className="add-opts">
          {OPTIONS.map((o) => (
            <button key={o.mode} type="button" className="add-opt" onClick={() => choose(o.mode)}>
              <span className="ic" style={{ background: o.color }}><Icon d={o.icon} /></span>
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
      <label className="night-field">Titlul poveștii
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'create' ? 'Ursulețul curajos' : 'Vulpița Fifi'} />
      </label>

      {mode === 'record' && !ready && (
        <>
          <p className="parent-sub">Citește în ritmul tău, ca la culcare. Poți face pauză oricând și continui de unde ai rămas.</p>
          <Recorder onDone={(blob, s) => { reset(); setAudio(blob); setSeconds(s); setSource('recording') }} />
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

      {mode === 'create' && !ready && (generating ? (
        <p className="importing"><span className="spinner" /> Scriu și înregistrez povestea… durează cam un minut.</p>
      ) : (
        <div className="create-form">
          <label className="night-field">Eroul poveștii{child.name ? <small> · din setări</small> : null}
            <input value={brief.childName ?? ''} onChange={(e) => setB('childName', e.target.value)} placeholder="Ana" />
          </label>
          <div className="night-field">
            <span>Este</span>
            <div className="pills">
              <button type="button" aria-pressed={brief.gender === 'girl'} onClick={() => setB('gender', brief.gender === 'girl' ? undefined : 'girl')}>fetiță</button>
              <button type="button" aria-pressed={brief.gender === 'boy'} onClick={() => setB('gender', brief.gender === 'boy' ? undefined : 'boy')}>băiețel</button>
            </div>
          </div>
          <div className="night-field">
            <span>Vârsta{child.age ? <small> · din setări</small> : null}</span>
            <div className="pills">
              {AGES.map((a) => <button type="button" key={a} aria-pressed={brief.age === a} onClick={() => setB('age', brief.age === a ? undefined : a)}>{a} ani</button>)}
            </div>
          </div>
          <div className="night-field">
            <span>Despre ce?</span>
            <div className="pills">
              {TOPICS.map((t) => (
                <button type="button" key={t} aria-pressed={topics.includes(t)}
                  onClick={() => setTopics((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{t}</button>
              ))}
            </div>
            <input value={brief.prompt ?? ''} onChange={(e) => setB('prompt', e.target.value)} placeholder="Altceva? Ex.: prima zi de grădiniță" />
          </div>
          <div className="night-field">
            <span>Cât de lungă?</span>
            <div className="pills">
              {LENGTHS.map(([k, l]) => <button type="button" key={k} aria-pressed={brief.length === k} onClick={() => setB('length', k)}>{l}</button>)}
            </div>
          </div>
          <button type="button" className="moon-btn" onClick={() => generate(false)}>Creează povestea</button>
          <details className="own-text">
            <summary>Am deja textul poveștii</summary>
            <textarea rows={6} value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="Lipește aici povestea, iar aplicația o citește cu voce tare." />
            <button type="button" className="moon-btn quiet" disabled={!ownText.trim()} onClick={() => generate(true)}>Citește textul meu</button>
          </details>
        </div>
      ))}

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
          <button className="moon-btn" type="submit" disabled={saving || !title.trim()}>{saving ? 'Se salvează…' : 'Pune pe raft'}</button>
          {source !== 'generated' && <p className="rec-hint">Se salvează și pe acest dispozitiv, merge și fără internet.</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
