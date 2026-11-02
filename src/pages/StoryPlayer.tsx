import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteStory, getStory } from '../lib/db'
import type { Story } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function StoryPlayer() {
  const { id } = useParams()
  const nav = useNavigate()
  const [s, setS] = useState<Story | null>()
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => { getStory(id!).then((x) => setS(x ?? null)) }, [id])
  const url = useFileUrl(s?.audioKey)
  if (s === undefined) return null
  if (s === null) return <p className="empty">Povestea nu a fost găsită.</p>

  const toggle = () => { const a = audio.current!; if (a.paused) a.play(); else a.pause() }
  const skip = (d: number) => { const a = audio.current!; a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }

  return (
    <div className="player">
      <Link to="/povesti" className="back">← Toate poveștile</Link>
      <div className={playing ? 'big-emoji spin' : 'big-emoji'}>{s.emoji}</div>
      <h1>{s.title}</h1>
      <audio ref={audio} src={url}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} />
      <div className="progress"><div style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} /></div>
      <div className="times"><span>{fmt(t)}</span><span>{dur ? fmt(dur) : ''}</span></div>
      <div className="controls">
        <button aria-label="Înapoi 15 secunde" onClick={() => skip(-15)}>⏪</button>
        <button aria-label={playing ? 'Pauză' : 'Pornește'} className="play" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
        <button aria-label="Înainte 15 secunde" onClick={() => skip(15)}>⏩</button>
      </div>
      <button className="btn danger small" onClick={async () => {
        if (confirm(`Ștergi povestea „${s.title}”?`)) { await deleteStory(s); nav('/povesti') }
      }}>Șterge povestea</button>
    </div>
  )
}
