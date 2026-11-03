import { useEffect, useRef, useState } from 'react'
import { startDictation, type Dictation } from '../lib/dictation'
import { useOnline } from '../lib/useOffline'

const MAX_SECONDS = 5 * 60

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function why(err: unknown) {
  const name = (err as Error)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Nu am acces la microfon. Permite-l din Setări › Safari › Microfon.'
  if (name === 'NotFoundError') return 'Nu găsesc niciun microfon.'
  return 'Dictarea s-a oprit. Verifică internetul și încearcă din nou.'
}

/**
 * Dictation button for a text box: tap to talk, tap again to stop.
 * Words are appended to `value` live, so they can be corrected by hand afterwards.
 */
export default function MicButton({ value, onChange, onDictated }: {
  value: string
  onChange: (v: string) => void
  /** Called when some text came from the microphone. */
  onDictated?: () => void
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'on' | 'finishing'>('idle')
  const [sec, setSec] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const online = useOnline()
  const session = useRef<Dictation>(undefined)

  // Stop listening if the screen is left mid-dictation.
  useEffect(() => () => session.current?.stop(), [])

  useEffect(() => {
    if (state !== 'on') return
    const t = setInterval(() => setSec((s) => {
      if (s + 1 >= MAX_SECONDS) session.current?.stop()
      return s + 1
    }), 1000)
    return () => clearInterval(t)
  }, [state])

  const start = async () => {
    setError(''); setSec(0); setState('starting')
    // New words go after what is already in the box.
    const base = value.trim()
    try {
      session.current = await startDictation({
        onText: (final, partial) => {
          const said = [final, partial].filter(Boolean).join(' ')
          if (!said) return
          onChange(base ? `${base}\n${said}` : said)
          onDictated?.()
        },
        onLevel: setLevel,
        onEnd: (err) => {
          session.current = undefined
          setState('idle'); setLevel(0)
          if (err) setError(why(err))
        },
      })
      setState((s) => (s === 'starting' ? 'on' : s))
    } catch (err) {
      session.current = undefined
      setState('idle')
      setError(why(err))
    }
  }

  const stop = () => { setState('finishing'); session.current?.stop() }

  const busy = state !== 'idle'
  return (
    <div className="dictate">
      <button type="button" className={`mic-btn${busy ? ' on' : ''}`} disabled={(!online && !busy) || state === 'starting' || state === 'finishing'}
        onClick={busy ? stop : start} aria-pressed={busy}
        style={busy ? { ['--lvl' as string]: level.toFixed(2) } : undefined}>
        {state === 'on' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        )}
        <span>{state === 'starting' ? 'Pornesc…' : state === 'on' ? `Gata · ${fmt(sec)}` : state === 'finishing' ? 'Termin…' : 'Dictează'}</span>
      </button>
      {state === 'on' ? <span className="set-hint">Te ascult, vorbește liber.</span>
        : !online ? <span className="set-hint">Dictarea merge doar cu internet.</span> : null}
      {error && <p className="set-hint error">{error}</p>}
    </div>
  )
}
