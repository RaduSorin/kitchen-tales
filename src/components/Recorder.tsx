import { useEffect, useRef, useState } from 'react'
import { fmtTime } from '../lib/stories'

const BARS = 44

type Session = { mr: MediaRecorder; stream: MediaStream; ctx?: AudioContext; analyser?: AnalyserNode; keep: boolean }

/** Voice recorder in the night style: live waveform, clock, pause/resume, start over and done. */
export default function Recorder({ onDone }: { onDone: (audio: Blob, seconds: number) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'paused'>('idle')
  const [sec, setSec] = useState(0)
  const [bars, setBars] = useState<number[]>([])
  const [error, setError] = useState('')
  const session = useRef<Session>(null)
  const secRef = useRef(0)

  // Stop the microphone if the parent leaves mid-recording; nothing is kept.
  useEffect(() => () => { const s = session.current; if (s && s.mr.state !== 'inactive') s.mr.stop() }, [])

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
      const s: Session = { mr, stream, keep: false }
      try {
        s.ctx = new AudioContext()
        s.analyser = s.ctx.createAnalyser()
        s.analyser.fftSize = 256
        s.ctx.createMediaStreamSource(stream).connect(s.analyser)
      } catch { /* waveform is optional */ }
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        s.ctx?.close().catch(() => {})
        if (s.keep) onDone(new Blob(chunks, { type: mr.mimeType }), secRef.current)
      }
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
    s.keep = keep
    if (s.mr.state !== 'inactive') s.mr.stop()
    session.current = null
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
