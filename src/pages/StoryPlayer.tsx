import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteStory, downloadStory, getOfflineAudio, getStory, removeOfflineAudio } from '../lib/db'
import type { Story } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { useFileUrl } from '../lib/useFileUrl'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, getPosition, SOURCE_LABEL, setPosition } from '../lib/stories'
import StoryCover from '../components/StoryCover'

type Sleep = 'end' | 15 | 30
const HOLD_MS = 1500

/** A lock button that leaves the player only after being held down, so a small child can't exit by accident. */
function HoldToExit({ onExit }: { onExit: () => void }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number>(undefined)
  const start = () => { setHolding(true); timer.current = window.setTimeout(onExit, HOLD_MS) }
  const stop = () => { setHolding(false); clearTimeout(timer.current) }
  return (
    <button className={holding ? 'hold-exit holding' : 'hold-exit'} aria-label="Ține apăsat ca să ieși"
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExit() }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      <span>{holding ? 'Ține apăsat…' : 'Ține apăsat ca să ieși'}</span>
    </button>
  )
}

export default function StoryPlayer() {
  const { id } = useParams()
  const nav = useNavigate()
  const { child } = useSettings()
  const [s, setS] = useState<Story | null>()
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [sleep, setSleep] = useState<Sleep>('end')
  const sleepLeft = useRef(0) // ms of listening left before the sleep timer stops the story
  const sleepReset = useRef(false)
  const [ended, setEnded] = useState(false)
  const [dim, setDim] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const [localAudio, setLocalAudio] = useState<Blob>()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState('')
  const offlineIds = useOfflineIds()
  const online = useOnline()
  const isSaved = !!id && offlineIds.has(id)
  useEffect(() => { getStory(id!).then((x) => setS(x ?? null)).catch(() => setS(null)) }, [id])
  useEffect(() => { getOfflineAudio(id!).then(setLocalAudio).catch(() => {}) }, [id, isSaved])
  const localUrl = useBlobUrl(localAudio)
  const remoteUrl = useFileUrl(localAudio ? undefined : s?.audioKey)
  const url = localUrl ?? remoteUrl

  // Lock-screen / headphone controls.
  useEffect(() => {
    if (!s || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: 'Kitchen Tales' })
  }, [s])

  // Sleep timer: stop after 15 or 30 minutes of listening (paused time doesn't count).
  useEffect(() => {
    if (sleep === 'end' || !playing) return
    const started = Date.now()
    const h = setTimeout(() => { audio.current?.pause(); setEnded(true) }, sleepLeft.current)
    return () => {
      clearTimeout(h)
      if (sleepReset.current) sleepReset.current = false
      else sleepLeft.current = Math.max(0, sleepLeft.current - (Date.now() - started))
    }
  }, [sleep, playing])

  // On the good-night screen, dim further after a while so the room stays dark.
  useEffect(() => {
    if (!ended) return
    const h = setTimeout(() => setDim(true), 20000)
    return () => clearTimeout(h)
  }, [ended])

  if (s === undefined) return <div className="night-player" />
  if (s === null) return <p className="empty">Povestea nu a fost găsită{online ? '' : ' pe acest dispozitiv'}.</p>

  const toggle = () => { const a = audio.current!; if (a.paused) a.play(); else a.pause() }
  const skip = (d: number) => { const a = audio.current!; a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }
  const chooseSleep = (v: Sleep) => { sleepLeft.current = v === 'end' ? 0 : v * 60000; sleepReset.current = playing && sleep !== 'end'; setSleep(v) }
  const restart = () => { setEnded(false); setDim(false); const a = audio.current!; a.currentTime = 0; a.play() }

  if (ended) {
    return (
      <div className={dim ? 'goodnight dim' : 'goodnight'} onClick={() => setDim(false)}>
        <svg width="120" height="120" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="40" fill="var(--moon)" /><circle cx="72" cy="42" r="36" fill="#161a46" /></svg>
        <h1>Noapte bună{child.name ? `, ${child.name}` : ''}</h1>
        <p>Povestea s-a terminat.<br />Ne auzim data viitoare.</p>
        <div className="goodnight-actions">
          <HoldToExit onExit={() => nav('/povesti')} />
          <button className="link-btn" onClick={restart}>Ascultă din nou</button>
        </div>
      </div>
    )
  }

  return (
    <div className="night-player">
      <div className="player-top">
        <HoldToExit onExit={() => nav('/povesti')} />
      </div>
      <StoryCover story={s} round className={playing ? 'playing' : ''} />
      <div className="player-title">
        <h1>{s.title}</h1>
        <small>{SOURCE_LABEL[s.source]}</small>
      </div>
      <audio ref={audio} src={url}
        onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setPosition(s.id, audio.current?.currentTime) }}
        onEnded={() => { setPlaying(false); setPosition(s.id, undefined); setEnded(true) }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          setDur(isFinite(a.duration) ? a.duration : 0)
          const pos = getPosition(s.id)
          if (pos && (!isFinite(a.duration) || pos < a.duration - 5)) a.currentTime = pos
        }} />
      <input type="range" className="seek" aria-label="Unde suntem în poveste" min={0} max={dur || 1} step={1} value={Math.min(t, dur || 1)}
        style={{ ['--p' as string]: dur ? `${(t / dur) * 100}%` : '0%' }}
        onChange={(e) => { if (audio.current) audio.current.currentTime = +e.target.value }} />
      <div className="seek-times"><span>{fmtTime(t)}</span><span>{dur ? fmtTime(dur) : ''}</span></div>
      <div className="night-controls">
        <button aria-label="Înapoi 15 secunde" onClick={() => skip(-15)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" /></svg>
        </button>
        <button className="play" aria-label={playing ? 'Pauză' : 'Pornește'} onClick={toggle} disabled={!url}>
          {playing
            ? <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" /></svg>
            : <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>}
        </button>
        <button aria-label="Înainte 15 secunde" onClick={() => skip(15)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v4h-4" /></svg>
        </button>
      </div>
      <div className="sleep" role="group" aria-label="Oprește după">
        <span>Oprește după</span>
        {([['end', 'poveste'], [15, '15 min'], [30, '30 min']] as [Sleep, string][]).map(([v, label]) => (
          <button key={v} aria-pressed={sleep === v} onClick={() => chooseSleep(v)}>{label}</button>
        ))}
      </div>

      <details className="parents">
        <summary>Pentru părinți</summary>
        <div className="parents-body">
          {s.text && <details className="story-text"><summary>Textul poveștii</summary><p>{s.text}</p></details>}
          <div className="row">
            {isSaved ? (
              <button className="btn small" onClick={() => removeOfflineAudio(s.id).then(() => setLocalAudio(undefined))}>Șterge de pe dispozitiv</button>
            ) : online ? (
              <button className="btn small" disabled={saving} onClick={async () => {
                setSaving(true); setMsg('')
                try { await downloadStory(s) } catch { setMsg('Descărcarea a eșuat. Încearcă din nou.') }
                setSaving(false)
              }}>{saving ? 'Se salvează…' : 'Salvează pentru offline'}</button>
            ) : null}
            {online && (confirmDelete ? (
              <span className="confirm">Ștergi povestea?
                <button className="btn danger small" onClick={async () => { await deleteStory(s); nav('/povesti') }}>Da, șterge</button>
                <button className="btn small" onClick={() => setConfirmDelete(false)}>Nu</button>
              </span>
            ) : <button className="btn danger small" onClick={() => setConfirmDelete(true)}>Șterge povestea</button>)}
          </div>
          {isSaved && <small>Salvată pe acest dispozitiv, merge și fără internet.</small>}
          {msg && <p className="error">{msg}</p>}
        </div>
      </details>
    </div>
  )
}
