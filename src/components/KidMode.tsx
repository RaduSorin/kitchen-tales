// Kid mode on screen: the PIN pad, the lock button that replaces the settings gear, the timer
// that ends the session calmly, and the lock screen when the time is up.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import Sheet from './Sheet'
import { useNowPlaying } from '../lib/nowPlaying'
import { useSettings } from '../lib/settings'
import { checkPin, exitKid, extendKid, getKid, kidFraction, kidLeft, kidRouteAllowed, lockKid, markPinReset, pinWait, setPin, useKid } from '../lib/kidMode'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
const PIN_LEN = 4

/** Four dots and a big number pad. Calls onPin with the four digits. */
function PinPad({ onPin, error }: { onPin: (pin: string) => void; error?: string }) {
  const [pin, setPinText] = useState('')
  const [wait, setWait] = useState(pinWait)
  useEffect(() => {
    if (!wait) return
    const h = setInterval(() => setWait(pinWait()), 1000)
    return () => clearInterval(h)
  }, [wait])
  // A wrong PIN clears the dots so the next try starts fresh.
  useEffect(() => { if (error) { setPinText(''); setWait(pinWait()) } }, [error])
  const press = (d: string) => {
    // Four digits in: they are being checked. More taps (a child pressing on) must not send them
    // again, each time counting as one more wrong try.
    if (wait || pin.length >= PIN_LEN) return
    if (d === '⌫') return setPinText((p) => p.slice(0, -1))
    const next = (pin + d).slice(0, PIN_LEN)
    setPinText(next)
    if (next.length === PIN_LEN) setTimeout(() => onPin(next), 120)
  }
  return (
    <div className="pin-pad">
      <div className="pin-dots" aria-label={`${pin.length} din ${PIN_LEN} cifre`}>
        {Array.from({ length: PIN_LEN }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <p className="pin-msg" role="alert">{wait ? `Prea multe încercări. Mai așteaptă ${wait} s.` : error ?? ' '}</p>
      <div className="pin-keys">
        {DIGITS.map((d, i) => d
          ? <button key={i} type="button" className="pin-key" disabled={!!wait} onClick={() => press(d)} aria-label={d === '⌫' ? 'Șterge o cifră' : d}>{d}</button>
          : <span key={i} />)}
      </div>
    </div>
  )
}

/** Choose a new PIN: typed twice. */
export function NewPinSheet({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [first, setFirst] = useState<string>()
  const [error, setError] = useState<string>()
  const [n, setN] = useState(0)
  return (
    <Sheet title={first ? 'Scrie PIN-ul din nou' : 'Alege un PIN din 4 cifre'} onClose={onClose}>
      <PinPad key={n} error={error} onPin={async (pin) => {
        if (!first) { setFirst(pin); setError(undefined); setN((x) => x + 1); return }
        if (pin !== first) { setFirst(undefined); setError('PIN-urile nu se potrivesc. Încearcă din nou.'); setN((x) => x + 1); return }
        await setPin(pin)
        onDone?.()
        onClose()
      }} />
    </Sheet>
  )
}

/** Asks for the PIN, then calls onOk. Also offers the way out when the PIN is forgotten. */
export function CheckPinSheet({ title, onClose, onOk }: { title: string; onClose: () => void; onOk: () => void }) {
  const [error, setError] = useState<string>()
  const [tries, setTries] = useState(0)
  const [forgot, setForgot] = useState(false)
  const { signOut } = useAuthenticator(() => [])
  return (
    <Sheet title={title} onClose={onClose}>
      {forgot ? (
        <div className="pin-forgot">
          <p>Te deconectăm din cont. După ce te conectezi din nou cu parola, modul copil se oprește și poți alege un PIN nou din Profil.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => { markPinReset(); signOut() }}>Deconectează-mă</button>
            <button type="button" className="btn" onClick={() => setForgot(false)}>Renunță</button>
          </div>
        </div>
      ) : (
        <>
          <PinPad key={tries} error={error} onPin={async (pin) => {
            if (await checkPin(pin)) onOk()
            else { setError('PIN greșit.'); setTries((x) => x + 1) }
          }} />
          <button type="button" className="link-btn pin-forgot-link" onClick={() => setForgot(true)}>Am uitat PIN-ul</button>
        </>
      )}
    </Sheet>
  )
}

/** After the PIN: more time, or leave kid mode. */
function ParentChoices({ onClose, locked }: { onClose: () => void; locked: boolean }) {
  const kid = useKid()
  const left = kidLeft(kid)
  return (
    <Sheet title="Pentru părinți" onClose={onClose}>
      <div className="kid-choices">
        {left != null && !locked && <p className="set-hint">Mai sunt {Math.ceil(left / 60000)} min.</p>}
        <div className="kid-more">
          <button type="button" className="btn big" onClick={() => { extendKid(15); onClose() }}>Încă 15 min</button>
          <button type="button" className="btn big" onClick={() => { extendKid(30); onClose() }}>Încă 30 min</button>
        </div>
        <button type="button" className="btn big primary" onClick={() => { exitKid(); onClose() }}>Ieși din modul copil</button>
      </div>
    </Sheet>
  )
}

/**
 * The parents' way out: a lock that must be held for 2 seconds (a child tapping around won't
 * open it), then the PIN, then the choices.
 */
export function KidLockButton({ className = 'icon-link kid-lock', locked = false }: { className?: string; locked?: boolean }) {
  const kid = useKid()
  const [step, setStep] = useState<'pin' | 'menu'>()
  const [holding, setHolding] = useState(false)
  // Re-draw every 5 s so the ring drains smoothly.
  const [, tick] = useState(0)
  useEffect(() => {
    if (kid.endsAt == null || locked) return
    const h = setInterval(() => tick((x) => x + 1), 5_000)
    return () => clearInterval(h)
  }, [kid.endsAt, locked])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = () => { setHolding(true); timer.current = setTimeout(() => { setHolding(false); setStep('pin') }, 2000) }
  const stop = () => { setHolding(false); clearTimeout(timer.current) }
  const left = kidLeft(kid)
  const mins = left == null ? undefined : Math.ceil(left / 60000)
  const soon = mins != null && mins <= 5 && !locked
  const frac = locked ? null : kidFraction(kid)
  return (
    <>
      <button type="button" className={`${className}${holding ? ' holding' : ''}${soon ? ' soon' : ''}`}
        aria-label={`Modul copil${mins != null && !locked ? `, mai sunt ${mins} ${mins === 1 ? 'minut' : 'minute'}` : ''}. Ține apăsat 2 secunde ca să ieși.`}
        onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        {/* The time left as a ring around the lock that drains clockwise. */}
        {frac != null && (
          <svg className="kid-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="19" pathLength="100" className="kid-ring-track" />
            <circle cx="22" cy="22" r="19" pathLength="100" className="kid-ring-left" strokeDasharray={`${frac * 100} 100`} />
          </svg>
        )}
      </button>
      {/* Outside the top bar (which moves while scrolling) and above the lock screen. */}
      {step && createPortal(
        <div className="kid-layer">
          {step === 'pin' && <CheckPinSheet title="PIN-ul de părinte" onClose={() => setStep(undefined)} onOk={() => setStep('menu')} />}
          {step === 'menu' && <ParentChoices locked={locked} onClose={() => setStep(undefined)} />}
        </div>, document.body)}
    </>
  )
}

/**
 * Kid mode on phones (no top bar): the lock with the minutes left, as a round glass button in the
 * page's top row, where the parent has their own buttons. Hidden on wide screens (the top bar has it).
 */
export function KidCorner() {
  return useKid().active ? <KidLockButton className="night-btn kid-lock kid-corner" /> : null
}

/** Says goodnight with the phone's Romanian voice, if it has one. */
function sayGoodnight(name: string) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    const u = new SpeechSynthesisUtterance(`Poveștile s-au culcat. Noapte bună${name ? `, ${name}` : ''}, și pe mâine!`)
    u.lang = 'ro-RO'
    u.rate = 0.9
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ro'))
    if (!voice) return
    u.voice = voice
    synth.speak(u)
  } catch { /* no voice: the screen says it */ }
}

/**
 * Watches the time. When it runs out, a story with at most 5 minutes left may finish; otherwise
 * (or once it ends) the sound fades out and the lock screen comes up.
 */
function useKidTimer() {
  const kid = useKid()
  const player = useNowPlaying()
  const { child } = useSettings()
  const [, tick] = useState(0)
  // The story allowed to finish after the time ran out.
  const finishing = useRef<string>(undefined)
  const lock = useCallback(async () => {
    if (getKid().locked) return
    finishing.current = undefined
    lockKid()
    await player.fadeOut()
    sayGoodnight(child.name)
  }, [player, child.name])

  useEffect(() => {
    if (!kid.active || kid.locked || kid.endsAt == null) return
    const h = setInterval(() => tick((x) => x + 1), 5000)
    // Timers sleep while the app is in the background: check again as soon as it is back.
    const wake = () => tick((x) => x + 1)
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(h); document.removeEventListener('visibilitychange', wake) }
  }, [kid.active, kid.locked, kid.endsAt])

  const over = kid.active && !kid.locked && kid.endsAt != null && Date.now() >= kid.endsAt
  // Also re-checked on every audio tick (player.t), which keeps running with the screen off.
  useEffect(() => {
    if (!over) { finishing.current = undefined; return }
    const id = player.story?.id
    if (finishing.current) {
      // The allowed story ended, was paused, or the player moved on: time to sleep.
      if (finishing.current !== id || !player.playing || player.ended) lock()
      return
    }
    const left = player.dur ? player.dur - player.t : Infinity
    if (player.playing && id && left <= 5 * 60) { finishing.current = id; return }
    lock()
  }, [over, player.t, player.playing, player.ended, player.story?.id, player.dur, lock])
}

/** The good-night screen shown when the time is up; only the parent's PIN opens the app again. */
function LockScreen() {
  const { child } = useSettings()
  return (
    <div className="kid-lockscreen" role="dialog" aria-modal="true" aria-label="Timpul s-a terminat">
      <div className="kid-lock-corner"><KidLockButton className="night-btn kid-lock" locked /></div>
      <svg className="kid-moon" width="150" height="150" viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r="40" fill="var(--moon, #ffe9a8)" /><circle cx="72" cy="42" r="36" fill="#121541" />
        <text x="30" y="34" fill="#ffe9a8" fontSize="12" fontWeight="700">z</text><text x="20" y="22" fill="#ffe9a8" fontSize="9" fontWeight="700">z</text>
      </svg>
      <h1>Poveștile s-au culcat</h1>
      <p>Pe mâine{child.name ? `, ${child.name}` : ''}!</p>
    </div>
  )
}

/**
 * Applies kid mode to the whole app: keeps the child on the stories pages, runs the timer and
 * shows the lock screen. Renders nothing when kid mode is off.
 */
export function KidGate() {
  const kid = useKid()
  const { pathname } = useLocation()
  useKidTimer()
  useEffect(() => {
    const root = document.documentElement
    if (kid.active) root.dataset.kid = kid.locked ? 'locked' : ''
    else delete root.dataset.kid
  }, [kid.active, kid.locked])
  if (!kid.active) return null
  if (kid.locked) return <LockScreen />
  if (!kidRouteAllowed(pathname)) return <Navigate to="/povesti/acasa" replace />
  return null
}
