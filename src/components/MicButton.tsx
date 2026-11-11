import { useEffect, useRef, useState } from 'react'
import { dictationError as why, startDictation, type Dictation } from '../lib/dictation'
import { useOnline } from '../lib/useOffline'

const MAX_SECONDS = 5 * 60

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Round dictation button for a text box: tap to talk, tap again to stop.
 * Words are appended to `value` live, so they can be corrected by hand afterwards.
 */
export default function MicButton({ value, onChange, onDictated, onStart, asLines, label = 'Dictează', hint, tool, children }: {
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
  /** Drawn as one of a row of small tools (icon over a word, e.g. under a recipe step) with this word. */
  tool?: string
  /** The text box the mic belongs to; without it the button stands on its own. */
  children?: React.ReactNode
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'on' | 'finishing'>('idle')
  const [sec, setSec] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<string>()
  const fail = (err: unknown) => { const w = why(err); console.error('Dictare:', err); setError(w.text); setDetail(w.detail) }
  const online = useOnline()
  const session = useRef<Dictation>(undefined)

  // Stop listening if the screen is left mid-dictation (also while the microphone is still opening).
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; session.current?.stop() } }, [])

  useEffect(() => {
    if (state !== 'on') return
    const t = setInterval(() => setSec((s) => {
      if (s + 1 >= MAX_SECONDS) session.current?.stop()
      return s + 1
    }), 1000)
    return () => clearInterval(t)
  }, [state])

  const start = async () => {
    setError(''); setDetail(undefined); setSec(0); setState('starting')
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
          if (err) fail(err)
        },
      })
      if (!alive.current) { session.current?.stop(); return }
      setState((s) => (s === 'starting' ? 'on' : s))
    } catch (err) {
      session.current = undefined
      setState('idle')
      fail(err)
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
    ? <p className={`set-hint mic-hint${error ? ' error' : ''}`}>{error || hint}{error && detail && <small className="mic-detail">{detail}</small>}</p> : null

  if (tool) return (
    <span className="mic-inline mic-tool">
      <button type="button" className={`ed-tool${busy ? ' on' : ''}`} disabled={(!online && !busy) || state === 'starting' || state === 'finishing'}
        onClick={busy ? stop : start} aria-pressed={busy} aria-label={busy ? 'Oprește dictarea' : !online ? 'Dictarea merge doar cu internet' : label}>
        {state === 'on'
          ? <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="currentColor" /></svg>
          : state === 'idle'
            ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></svg>
            : <span className="mic-spin" aria-hidden="true" />}
        <span>{state === 'on' ? fmt(sec) : tool}</span>
      </button>
      {below}
    </span>
  )
  // With a text box inside: the mic sits in its bottom-right corner, like the iPhone keyboard's.
  if (children) return <><div className="mic-field">{children}{mic}</div>{below}</>
  return <span className="mic-inline">{mic}{below}</span>
}
