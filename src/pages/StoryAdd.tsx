import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createStory, fileUrl, generateStory, removeFile, uploadFile, type StoryBrief } from '../lib/db'
import type { StorySource } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { getSettings } from '../lib/settings'

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

const EMOJIS = ['🐻', '🦊', '🐰', '🦁', '🐉', '🧚', '👑', '🚀', '🌙', '⭐', '🐢', '🦄']

export default function StoryAdd() {
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [audio, setAudio] = useState<Blob>()
  const [source, setSource] = useState<StorySource>('upload')
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const rec = useRef<MediaRecorder>(null)
  const localPreview = useBlobUrl(audio)
  const [mode, setMode] = useState<'audio' | 'generate'>('audio')
  const [brief, setBrief] = useState<StoryBrief>(() => ({ length: 'medium', ...loadBrief() }))
  const setB = <K extends keyof StoryBrief>(k: K, v: StoryBrief[K]) => setBrief((b) => ({ ...b, [k]: v }))
  const [ownText, setOwnText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ text: string; audioKey: string; url: string }>()
  const preview = generated?.url ?? localPreview

  const generate = async (useOwnText: boolean) => {
    if (!title.trim()) { setError('Scrie întâi un titlu.'); return }
    setGenerating(true); setError('')
    try {
      if (generated) await removeFile(generated.audioKey)
      if (!useOwnText) saveBrief(brief)
      const g = await generateStory({ title: title.trim(), ...(useOwnText ? { text: ownText } : brief) })
      setGenerated({ ...g, url: await fileUrl(g.audioKey) })
      setAudio(undefined); setSource('generated')
    } catch (err) {
      setError(`Nu am putut crea povestea: ${(err as Error).message}`)
    }
    setGenerating(false)
  }

  const startRec = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setAudio(new Blob(chunks, { type: mr.mimeType })); setSource('recording')
      }
      mr.start(); rec.current = mr; setRecording(true)
    } catch {
      setError('Nu am acces la microfon. Verifică permisiunile browserului.')
    }
  }
  const stopRec = () => { rec.current?.stop(); setRecording(false) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || (!audio && !generated)) return
    setSaving(true); setError('')
    try {
      const audioKey = generated ? generated.audioKey : await uploadFile('stories', audio!, 'webm')
      const id = await createStory({ title: title.trim(), emoji, source, audioKey, text: generated?.text })
      nav(`/povesti/${id}`, { replace: true })
    } catch (err) {
      setError(`Nu am putut salva povestea: ${(err as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <h1>Poveste nouă</h1>
      <label>Titlu<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ursulețul curajos" /></label>
      <label>Alege o imagine</label>
      <div className="emoji-pick">
        {EMOJIS.map((x) => (
          <button type="button" key={x} className={x === emoji ? 'on' : ''} onClick={() => setEmoji(x)}>{x}</button>
        ))}
      </div>
      <div className="tabs">
        <button type="button" className={mode === 'audio' ? 'tab on' : 'tab'} onClick={() => setMode('audio')}>🎙️ Audio propriu</button>
        <button type="button" className={mode === 'generate' ? 'tab on' : 'tab'} onClick={() => setMode('generate')}>✨ Citită de aplicație</button>
      </div>

      {mode === 'audio' ? (
        <>
          <label>Încarcă un fișier audio (MP3, M4A…)
            <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAudio(f); setGenerated(undefined); setSource('upload') } }} />
          </label>
          <div className="or">sau</div>
          {recording
            ? <button type="button" className="btn danger big" onClick={stopRec}>⏹ Oprește înregistrarea</button>
            : <button type="button" className="btn big" onClick={startRec}>🎙️ Înregistrează cu vocea ta</button>}
        </>
      ) : generating ? (
        <p className="importing"><span className="spinner" /> Scriu și înregistrez povestea… durează cam un minut.</p>
      ) : (
        <>
          <div className="brief">
            <label>Prenumele copilului (opțional)
              <input value={brief.childName ?? ''} onChange={(e) => setB('childName', e.target.value)} placeholder="Ana" />
            </label>
            <div className="field">
              <span>Pentru</span>
              <div className="chips">
                <button type="button" className={brief.gender === 'girl' ? 'chip on' : 'chip'} onClick={() => setB('gender', brief.gender === 'girl' ? undefined : 'girl')}>👧 Fetiță</button>
                <button type="button" className={brief.gender === 'boy' ? 'chip on' : 'chip'} onClick={() => setB('gender', brief.gender === 'boy' ? undefined : 'boy')}>👦 Băiețel</button>
              </div>
            </div>
            <div className="field">
              <span>Vârsta</span>
              <div className="chips">
                {AGES.map((a) => (
                  <button type="button" key={a} className={brief.age === a ? 'chip on' : 'chip'} onClick={() => setB('age', brief.age === a ? undefined : a)}>{a} ani</button>
                ))}
              </div>
            </div>
            <label>Cuvinte cheie sau o scurtă descriere
              <textarea rows={3} value={brief.prompt ?? ''} onChange={(e) => setB('prompt', e.target.value)}
                placeholder="Ex.: arici, lac, prietenie, prima zi de grădiniță" />
            </label>
            <div className="field">
              <span>Lungime</span>
              <div className="chips">
                {([['short', 'Scurtă · 2 min'], ['medium', 'Medie · 4 min'], ['long', 'Lungă · 7 min']] as const).map(([k, l]) => (
                  <button type="button" key={k} className={brief.length === k ? 'chip on' : 'chip'} onClick={() => setB('length', k)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <button type="button" className="btn big" onClick={() => generate(false)}>✨ Scrie o poveste nouă</button>
          <div className="or">sau</div>
          <label>Am deja textul poveștii
            <textarea rows={5} value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="Lipește aici povestea, iar aplicația o citește cu voce tare." />
          </label>
          <button type="button" className="btn big" disabled={!ownText.trim()} onClick={() => generate(true)}>🔊 Citește textul meu</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {generated && <details className="story-text"><summary>Textul poveștii</summary><p>{generated.text}</p></details>}
      {preview && <audio controls src={preview} className="preview-audio" />}
      <div className="row">
        <button className="btn primary" type="submit" disabled={(!audio && !generated) || !title.trim() || saving || generating}>{saving ? 'Se salvează…' : 'Salvează'}</button>
        <button className="btn" type="button" onClick={() => nav(-1)}>Anulează</button>
      </div>
    </form>
  )
}
