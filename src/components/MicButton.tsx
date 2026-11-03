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
 * Round dictation button for a text box: tap to talk, tap again to stop.
 * Words are appended to `value` live, so they can be corrected by hand afterwards.
 */
export default function MicButton({ value, onChange, onDictated, onStart, asLines, label = 'Dictează', hint, children }: {
  value: string
  onChange: (v: string) => void
  /** Called when some text came from the microphone. */
  onDictated?: () => void
  /** Called on the tap that starts listening, before any text arrives. */
  onStart?: () => void
  /** Turns the phrases said so far into lines (one per pause), e.g. an ingredient list. Default: one running text. */
  asLines?: (segments: string[]) => string[]
  /** Accessible name of the button. */
  label?: string
  /** Shown under the box while listening. */
  hint?: string
  /** The text box the mic belongs to; without it the button stands on its own. */
  children?: React.ReactNode
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
    onStart?.()
    try {
      session.current = await startDictation({
        onText: (segments, partial) => {
          const said = asLines
            ? [...asLines(segments), partial].filter(Boolean).join('\n')
            : [...segments, partial].filter(Boolean).join(' ')
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
  const mic = (
    <span className="mic">
      {state === 'on' && <span className="mic-time" aria-live="off">{fmt(sec)}</span>}
      <button type="button" className={`mic-btn${busy ? ' on' : ''}`} disabled={(!online && !busy) || state === 'starting' || state === 'finishing'}
        onClick={busy ? stop : start} aria-pressed={busy}
        aria-label={busy ? 'Oprește dictarea' : !online ? 'Dictarea merge doar cu internet' : label}
        title={busy ? 'Oprește dictarea' : !online ? 'Dictarea merge doar cu internet' : label}
        style={busy ? { ['--lvl' as string]: level.toFixed(2) } : undefined}>
        {state === 'idle' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        ) : state === 'on' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" /></svg>
        ) : <span className="mic-spin" aria-hidden="true" />}
      </button>
    </span>
  )
  const below = (state === 'on' && hint) || error
    ? <p className={`set-hint mic-hint${error ? ' error' : ''}`}>{error || hint}</p> : null

  // With a text box inside: the mic sits in its bottom-right corner, like the iPhone keyboard's.
  if (children) return <><div className="mic-field">{children}{mic}</div>{below}</>
  return <span className="mic-inline">{mic}{below}</span>
}
