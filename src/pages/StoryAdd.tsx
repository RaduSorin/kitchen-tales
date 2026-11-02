import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createStory, uploadFile } from '../lib/db'
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
  const preview = useBlobUrl(audio)

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
    if (!title.trim() || !audio) return
    setSaving(true); setError('')
    try {
      const audioKey = await uploadFile('stories', audio, 'webm')
      const id = await createStory({ title: title.trim(), emoji, source, audioKey })
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
      <label>Încarcă un fișier audio (MP3, M4A…)
        <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAudio(f); setSource('upload') } }} />
      </label>
      <div className="or">sau</div>
      {recording
        ? <button type="button" className="btn danger big" onClick={stopRec}>⏹ Oprește înregistrarea</button>
        : <button type="button" className="btn big" onClick={startRec}>🎙️ Înregistrează cu vocea ta</button>}
      {error && <p className="error">{error}</p>}
      {preview && <audio controls src={preview} className="preview-audio" />}
      <div className="row">
        <button className="btn primary" type="submit" disabled={!audio || !title.trim() || saving}>{saving ? 'Se salvează…' : 'Salvează'}</button>
        <button className="btn" type="button" onClick={() => nav(-1)}>Anulează</button>
      </div>
    </form>
  )
}
