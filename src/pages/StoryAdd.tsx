import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createStory, fileUrl, generateStory, removeFile, uploadFile } from '../lib/db'
import type { StorySource } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'

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
  const [prompt, setPrompt] = useState('')
  const [ownText, setOwnText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ text: string; audioKey: string; url: string }>()
  const preview = generated?.url ?? localPreview

  const generate = async (useOwnText: boolean) => {
    if (!title.trim()) { setError('Scrie întâi un titlu.'); return }
    setGenerating(true); setError('')
    try {
      if (generated) await removeFile(generated.audioKey)
      const g = await generateStory({ title: title.trim(), ...(useOwnText ? { text: ownText } : { prompt }) })
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
          <label>Despre ce să fie povestea?
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: un arici care învață să înoate, pentru Ana, 4 ani" />
          </label>
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
