import { useEffect, useRef, useState } from 'react'
import { fmtTime } from '../lib/stories'
import { keepAwake } from '../lib/keepAwake'
import { useLeaveGuard } from '../lib/leaveGuard'

const BARS = 44

type Session = { mr: MediaRecorder; stream: MediaStream; ctx?: AudioContext; analyser?: AnalyserNode; discard: boolean; byUser: boolean }

const LEAVE = {
  title: 'Oprești înregistrarea?',
  text: 'Dacă pleci de pe acest ecran, ce ai înregistrat până acum se pierde.',
  stay: 'Continuă înregistrarea',
  leave: 'Pleacă și renunță',
}

/**
 * Voice recorder in the night style: live waveform, clock, pause/resume, start over and done.
 * `interrupted` is true when the phone stopped the microphone (a call, the screen locked anyway):
 * what was recorded until then is handed over instead of being lost.
 */
export default function Recorder({ onDone }: { onDone: (audio: Blob, seconds: number, interrupted?: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'paused'>('idle')
  const [sec, setSec] = useState(0)
  const [bars, setBars] = useState<number[]>([])
  const [error, setError] = useState('')
  const session = useRef<Session>(null)
  const secRef = useRef(0)

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Stop the microphone if the parent leaves mid-recording; nothing is kept.
  useEffect(() => () => { const s = session.current; if (s) { s.discard = true; if (s.mr.state !== 'inactive') s.mr.stop() } }, [])

  // While a recording is open (also paused): the screen stays on, and leaving the screen asks first.
  const open = state !== 'idle'
  useEffect(() => (open ? keepAwake() : undefined), [open])
  useLeaveGuard(open, LEAVE)

  // The app went to the background: pause, so nothing odd is recorded; "Continuă" picks it up again.
  useEffect(() => {
    if (state !== 'rec') return
    const onHide = () => {
      const mr = session.current?.mr
      if (document.visibilityState === 'hidden' && mr?.state === 'recording') { mr.pause(); setState('paused') }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [state])

  // While recording: a clock tick every second and a waveform bar every ~120 ms.
  useEffect(() => {
    if (state !== 'rec') return
    const clock = setInterval(() => { secRef.current += 1; setSec(secRef.current) }, 1000)
    const buf = new Uint8Array(256)
    const wave = setInterval(() => {
      const a = session.current?.analyser
      if (!a) return
      a.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      setBars((b) => [...b.slice(-(BARS - 1)), Math.min(1, peak / 70)])
    }, 120)
    return () => { clearInterval(clock); clearInterval(wave) }
  }, [state])

  const start = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const s: Session = { mr, stream, discard: false, byUser: false }
      try {
        s.ctx = new AudioContext()
        s.analyser = s.ctx.createAnalyser()
        s.analyser.fftSize = 256
        s.ctx.createMediaStreamSource(stream).connect(s.analyser)
      } catch { /* waveform is optional */ }
      mr.ondataavailable = (e) => chunks.push(e.data)
      // "Gata" stops on purpose; anything else (the system took the microphone away) is an interruption.
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        s.ctx?.close().catch(() => {})
        const interrupted = !s.byUser
        if (session.current === s) { session.current = null; setState('idle') }
        if (s.discard) return
        if (chunks.length && secRef.current >= 1) onDoneRef.current(new Blob(chunks, { type: mr.mimeType }), secRef.current, interrupted)
        else if (interrupted) { secRef.current = 0; setSec(0); setBars([]); setError('Înregistrarea s-a oprit. Apasă butonul roșu ca să începi din nou.') }
      }
      // iOS ends the microphone track when it takes the mic away; stop cleanly and keep what we have.
      stream.getAudioTracks().forEach((t) => { t.onended = () => { if (mr.state !== 'inactive') mr.stop() } })
      mr.start(1000)
      session.current = s
      secRef.current = 0; setSec(0); setBars([])
      setState('rec')
    } catch {
      setError('Nu am acces la microfon. Verifică permisiunile browserului.')
    }
  }

  const main = () => {
    const mr = session.current?.mr
    if (state === 'idle') start()
    else if (state === 'rec') { mr?.pause(); setState('paused') }
    else { mr?.resume(); setState('rec') }
  }
  const stop = (keep: boolean) => {
    const s = session.current
    if (!s) return
    s.discard = !keep
    s.byUser = true
    session.current = null
    if (s.mr.state !== 'inactive') s.mr.stop()
    secRef.current = keep ? secRef.current : 0
    setState('idle')
    if (!keep) { setSec(0); setBars([]) }
  }

  const shown = [...Array<number>(BARS - bars.length).fill(0), ...bars]
  return (
    <div className="recorder">
      <div className="wave" aria-hidden="true">
        {shown.map((v, k) => <i key={k} className={state === 'rec' ? '' : 'old'} style={{ height: `${8 + v * 82}%` }} />)}
      </div>
      <div className="rec-clock" role="timer">{fmtTime(sec)}</div>
      <div className="rec-btns">
        <button type="button" className="rec-sm" onClick={() => stop(false)} disabled={state === 'idle'}>Reia</button>
        <button type="button" className={`rec-big ${state}`} onClick={main}
          aria-label={state === 'idle' ? 'Începe înregistrarea' : state === 'rec' ? 'Pauză' : 'Continuă înregistrarea'}>
          {state === 'rec'
            ? <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" /></svg>
            : <i />}
        </button>
        <button type="button" className="rec-sm" onClick={() => stop(true)} disabled={state === 'idle' || sec < 1}>Gata</button>
      </div>
      <p className="rec-hint">
        {state === 'idle' ? 'Apasă butonul roșu și începe să citești.' : state === 'rec' ? 'Se înregistrează. Poți face pauză oricând.' : 'Pauză. Continuă când ești gata.'}
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
