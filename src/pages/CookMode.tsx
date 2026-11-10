import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getRecipe } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { detectDuration, formatClock, getProgress, ingredientsForStep, loadTimers, saveTimers, setProgress, type CookTimer } from '../lib/cooking'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { ringAlarm, unlockAlarm } from '../lib/alarm'
import { canGoBack } from '../lib/back'
import { isHeading } from '../lib/scale'
import { alarmId, cancelAlarm, pushProblem, scheduleAlarm } from '../lib/timerPush'
import { addCookNote, cookedLabel, markCooked, useRecipeLog } from '../lib/recipeLog'
import { track } from '../lib/badges/store'
import { useMyName } from '../lib/me'
import { canSpeak, speak, spokenDuration, stopSpeaking, useHandsFree, type Command } from '../lib/handsFree'

// Timers are kept per recipe (lib/cooking.ts); one that ends while you are elsewhere in the app
// rings there too (lib/cookAlarms.ts).
type Timer = CookTimer
const leftOf = (t: Timer, now = Date.now()) => (t.endsAt ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.left)

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    const take = () => { navigator.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') take() }
    take()
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}) }
  }, [])
}

/**
 * A step's own photo fills the screen. Steps without one show the recipe photo, dimmed, with the
 * big step number on top; recipes without any photo keep the drawn plate.
 */
function StepBackground({ photoKey, recipePhotoKey, seed, index }: { photoKey?: string; recipePhotoKey?: string; seed: string; index: number }) {
  const url = useFileUrl(photoKey || undefined)
  const recipeUrl = useFileUrl(photoKey ? undefined : recipePhotoKey || undefined)
  if (url) return <img className="cook-bg" src={url} alt="" />
  if (recipeUrl) return (
    <div className="cook-bg">
      <img className="cook-bg cook-bg-recipe" src={recipeUrl} alt="" />
      <span className="cook-bignum" aria-hidden="true">{index + 1}</span>
    </div>
  )
  return (
    <div className="cook-bg cook-bg-plain">
      <PlatePlaceholder seed={seed} className="cook-bg-art" />
      <span className="cook-bignum" aria-hidden="true">{index + 1}</span>
    </div>
  )
}

export default function CookMode() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Closing goes back to the recipe page this was opened from, instead of adding a second copy
  // of it (then Back would open cooking mode again). From elsewhere (Home, a notification) it
  // takes this screen's place.
  const fromRecipe = !!(location.state as { fromRecipe?: boolean } | null)?.fromRecipe
  const close = useCallback(() => {
    if (fromRecipe && canGoBack()) nav(-1)
    else nav(`/retete/${id}`, { replace: true })
  }, [fromRecipe, nav, id])
  const [r, setR] = useState<Recipe | null>()
  const [i, setI] = useState(0)
  const [finished, setFinished] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [have, setHave] = useState<Set<number>>(new Set())
  const [timers, setTimersState] = useState<Record<number, Timer>>(() => (id ? loadTimers(id) : {}))
  const setTimers = useCallback((next: Record<number, Timer>) => { setTimersState(next); if (id) saveTimers(id, next) }, [id])
  const [now, setNow] = useState(() => Date.now())
  const touch = useRef<{ x: number; y: number }>(null)
  const log = useRecipeLog(id)
  const me = useMyName()
  const [note, setNote] = useState('')
  useWakeLock()

  // Hands-free: each step is read aloud and voice commands move through the recipe.
  const [handsFree, setHandsFree] = useState(false)
  const [hfAttempt, setHfAttempt] = useState(0)
  const speakingUntil = useRef(0)
  const say = useCallback(async (text: string) => {
    speakingUntil.current = Date.now() + 120_000
    await speak(text)
    // The microphone still hears the end of our own voice for a moment.
    speakingUntil.current = Date.now() + 700
  }, [])
  const onCommand = useRef<(c: Command) => void>(() => {})
  const hf = useHandsFree(handsFree, hfAttempt, (c) => onCommand.current(c), () => Date.now() < speakingUntil.current)
  const spokenKey = useRef('')
  const stepSpeech = useCallback((x: Recipe, k: number) => {
    const d = detectDuration(x.steps[k])
    return `Pasul ${k + 1}. ${x.steps[k]}${d ? ` Are un timer de ${spokenDuration(d)}. Spune: pornește timerul.` : ''}`
  }, [])
  useEffect(() => {
    if (!handsFree || !r) return
    const key = finished ? 'done' : String(i)
    if (spokenKey.current === key) return
    spokenKey.current = key
    say(finished ? `Poftă bună! Ai terminat ${r.title}.` : stepSpeech(r, i))
  }, [handsFree, r, i, finished, say, stepSpeech])
  useEffect(() => { if (!handsFree) stopSpeaking() }, [handsFree])
  // Late-night cooking is one of the surprise stamps.
  useEffect(() => { track({ t: 'cook-opened' }) }, [])
  useEffect(() => () => stopSpeaking(), [])
  const toggleHandsFree = () => {
    if (!r) return
    // It stopped hearing (no internet, the microphone taken): a tap starts listening again.
    if (handsFree && hf.error) { setHfAttempt((n) => n + 1); say('Te ascult.'); return }
    if (handsFree) { setHandsFree(false); return }
    unlockAlarm()
    // Spoken straight from the tap: iOS lets a page speak only after a touch.
    spokenKey.current = finished ? 'done' : String(i)
    say(`Te ascult. Spune: următorul, înapoi, repetă, ingrediente sau pornește timerul. ${finished ? '' : stepSpeech(r, i)}`)
    setHandsFree(true)
  }

  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    getRecipe(id!).then((x) => {
      setR(x ?? null)
      const saved = getProgress(id!)
      if (x && saved != null && saved < x.steps.length) setI(saved)
    }).catch(() => setFailed(true))
  }, [id])
  useEffect(load, [load])

  const count = r?.steps.length ?? 0
  const go = useCallback((d: number) => {
    if (!r) return
    setSheet(false)
    if (finished) { if (d < 0) setFinished(false); return }
    const n = i + d
    if (n < 0) return
    if (n >= count) { setFinished(true); setProgress(r.id, undefined); markCooked(r.id); track({ t: 'cook-finished' }); return }
    setI(n); setProgress(r.id, n)
  }, [r, i, count, finished])

  // Keyboard: arrows to move, Escape to close the ingredients sheet or leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Space on a button or a tick box (the ingredients sheet, the timer) does that control's job.
      if (e.key === ' ' && (e.target as Element | null)?.closest?.('button, input, textarea, select, a, label')) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowUp') setSheet(true)
      else if (e.key === 'ArrowDown') setSheet(false)
      else if (e.key === 'Escape') { if (sheet) setSheet(false); else close() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, sheet, close])

  // One tick redraws every running timer, so they keep counting while you move between steps.
  // A timer that ran out (also while the app was away) rings once and stops.
  const timersRef = useRef(timers)
  useEffect(() => { timersRef.current = timers }, [timers])
  const anyRunning = Object.values(timers).some((t) => t.endsAt)
  useEffect(() => {
    if (!anyRunning) return
    const tick = () => {
      const now = Date.now()
      let over = false
      const next = { ...timersRef.current }
      for (const [k, t] of Object.entries(next)) {
        if (t.endsAt && t.endsAt <= now) { over = true; next[+k] = { total: t.total, left: 0 } }
      }
      if (over) { ringAlarm(); setTimers(next) }
      setNow(now)
    }
    tick()
    const h = setInterval(tick, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(h); document.removeEventListener('visibilitychange', onVisible) }
  }, [anyRunning, setTimers])

  // Cooking mode hides the tab bar, so every dead end here needs its own way out.
  if (failed || r === null || (r && count === 0)) {
    const leave = () => (r && canGoBack() ? nav(-1) : nav(r ? `/retete/${r.id}` : '/retete', { replace: true }))
    return (
      <div className="cook">
        <div className="cook-empty" role="alert">
          <p>{failed ? 'Nu am putut deschide rețeta. Verifică internetul.' : r ? 'Rețeta nu are pași de urmat.' : 'Rețeta nu a fost găsită.'}</p>
          {failed && <button className="btn big" onClick={() => { setFailed(false); load() }}>Încearcă din nou</button>}
          <button className="btn" onClick={leave}>{r ? 'Înapoi la rețetă' : 'Rețetele mele'}</button>
        </div>
      </div>
    )
  }
  if (r === undefined) return <div className="cook"><div className="cook-empty"><span className="spinner" aria-label="Se încarcă" /></div></div>

  const step = r.steps[i]
  const duration = detectDuration(step)
  const saved = timers[i]
  // A timer is kept only for the step's current duration (the recipe may have been edited since).
  const timer = saved && saved.total === duration ? saved : duration ? { total: duration, left: duration } : undefined
  const timerLeft = timer ? leftOf(timer, now) : 0
  const running = !!timer?.endsAt
  const toggleTimer = () => {
    if (!timer) return
    unlockAlarm()
    const key = alarmId(r.id, i)
    if (timerLeft === 0) { setTimers({ ...timers, [i]: { total: timer.total, left: timer.total } }); return }
    if (running) {
      cancelAlarm(key)
      setTimers({ ...timers, [i]: { total: timer.total, left: Math.max(1, leftOf(timer)) } })
      return
    }
    const endsAt = Date.now() + timerLeft * 1000
    track({ t: 'timers', running: Object.entries(timers).filter(([k, t]) => +k !== i && t.endsAt).length + 1 })
    setTimers({ ...timers, [i]: { total: timer.total, left: timerLeft, endsAt, title: r.title } })
    // Straight from the tap, so iOS may ask for notification permission.
    scheduleAlarm(key, endsAt, r.title, `Pasul ${i + 1} e gata (${formatClock(timer.total)}).`, `/retete/${r.id}/gateste`)
      .then((push) => {
        const cur = timersRef.current[i]
        if (cur?.endsAt === endsAt) setTimers({ ...timersRef.current, [i]: { ...cur, push } })
      })
  }
  const problem = running && !timer?.push ? pushProblem() : ''
  const otherRunning = Object.entries(timers).filter(([k, t]) => +k !== i && (t.endsAt || t.left === 0))
  const forStep = ingredientsForStep(step, r.ingredients)

  onCommand.current = (c: Command) => {
    if (c.kind === 'next') { go(1); track({ t: 'hands-free' }) }
    else if (c.kind === 'prev') go(-1)
    else if (c.kind === 'repeat') say(finished ? 'Poftă bună!' : stepSpeech(r, i))
    else if (c.kind === 'ingredients') {
      const list = (forStep.length ? forStep : r.ingredients.filter((x) => !isHeading(x)))
      say(list.length ? `${forStep.length ? `Pentru pasul ${i + 1}` : 'Ingrediente'}: ${list.join(', ')}.` : 'Rețeta nu are ingrediente scrise.')
    } else if (c.kind === 'timer') {
      if (!timer) say('Pasul acesta nu are timer.')
      else if (!running) { toggleTimer(); say(`Am pornit timerul de ${spokenDuration(timerLeft || timer.total)}.`) }
    } else if (c.kind === 'pause') { if (running) { toggleTimer(); say('Am oprit timerul.') } }
    else if (c.kind === 'step') {
      if (c.n >= 1 && c.n <= count) { setFinished(false); setSheet(false); setI(c.n - 1); setProgress(r.id, c.n - 1) }
      else say(`Rețeta are ${count} pași.`)
    } else if (c.kind === 'stop') { setHandsFree(false); say('Gata, nu mai ascult.') }
  }

  // Swipes change the step or open the ingredients; inside the ingredients sheet a finger scrolls the
  // list instead (scrolling back up must not close it, sideways must not change the step).
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = (e.target as Element).closest('.cook-sheet') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) setSheet(dy < 0)
    else if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
  }

  const toggleHave = (k: number) => setHave((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="cook" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {finished ? (
        <div className="cook-done">
          <PlatePlaceholder seed={r.title} className="cook-done-art" />
          <h1>Poftă bună!</h1>
          <p>Ai terminat {r.title}.</p>
          {cookedLabel(log) && <small className="cook-done-count">{cookedLabel(log)}</small>}
          <label className="cook-done-note">
            <span>O notă pentru data viitoare? (opțional)</span>
            <textarea rows={2} maxLength={500} placeholder="ex. mai puțină sare, copilului i-a plăcut" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="cook-done-actions">
            <button className="btn big" onClick={() => {
              if (note.trim()) addCookNote(r.id, note, me || undefined)
              close()
            }}>{note.trim() ? 'Salvează nota și închide' : 'Gata'}</button>
            <button className="btn" onClick={() => go(-1)}>Înapoi la ultimul pas</button>
          </div>
        </div>
      ) : (
        <>
          <StepBackground key={i} photoKey={r.stepPhotoKeys?.[i]} recipePhotoKey={r.photoKey} seed={r.title} index={i} />
          <div className="cook-top">
            <div className="cook-bars" role="progressbar" aria-valuemin={1} aria-valuemax={count} aria-valuenow={i + 1} aria-label="Progres">
              {r.steps.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}
            </div>
            <div className="cook-head">
              <span className="cook-name"><span className="cook-title">{r.title}</span> <span className="cook-pos">{i + 1} din {count}</span></span>
              <span className="cook-head-btns">
              {canSpeak() && (
                <button className={`cook-mic${handsFree ? ' on' : ''}${hf.listening ? ' live' : ''}`} aria-pressed={handsFree}
                  aria-label={handsFree ? 'Oprește gătitul fără mâini' : 'Gătește fără mâini: citesc pașii și te ascult'} onClick={toggleHandsFree}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
                </button>
              )}
              <button className="cook-close" aria-label="Închide modul de gătit" onClick={close}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              </span>
              {otherRunning.length > 0 && <span className="cook-timers">{otherRunning.map(([k, t]) => (
                <button key={k} className={leftOf(t, now) === 0 ? 'cook-mini ring' : 'cook-mini'} onClick={() => { setI(+k); setProgress(r.id, +k) }}>
                  Pasul {+k + 1} · {leftOf(t, now) === 0 ? 'gata!' : formatClock(leftOf(t, now))}
                </button>
              ))}</span>}
            </div>
          </div>

          <div className="cook-zones">
            <button aria-label="Pasul anterior" onClick={() => go(-1)} disabled={i === 0} />
            <button aria-label="Pasul următor" onClick={() => go(1)} />
          </div>

          <div className="cook-panel" aria-live="polite">
            {handsFree && (
              <div className="cook-listen" role="status">
                {hf.error ? <span className="cook-listen-err">{hf.error}</span> : <>
                  <b>{hf.listening ? 'Te ascult' : 'Pornesc microfonul…'}</b>
                  <span>{hf.heard ? `„${hf.heard}”` : '„următorul” · „înapoi” · „repetă” · „pornește timerul”'}</span>
                </>}
              </div>
            )}
            <div className="cook-no">Pasul {i + 1}</div>
            <p className="cook-text">{step}</p>
            {forStep.length > 0 && (
              <div className="cook-chips">{forStep.map((x) => <span key={x}>{x}</span>)}</div>
            )}
            {timer && (
              <button className={timerLeft === 0 ? 'cook-timer ring' : 'cook-timer'} onClick={toggleTimer}>
                <b>{timerLeft === 0 ? 'Gata!' : formatClock(timerLeft)}</b>
                <span>{timerLeft === 0 ? 'Din nou' : running ? 'Pauză' : timerLeft < timer.total ? 'Continuă' : 'Pornește'}</span>
              </button>
            )}
            {running && (timer?.push
              ? <small className="cook-timer-hint">Primești o notificare când e gata, chiar dacă ieși din aplicație.</small>
              : problem === 'install' ? <small className="cook-timer-hint">Ca să primești alerta cu ecranul blocat, deschide aplicația de pe ecranul principal.</small>
              : problem === 'denied' ? <small className="cook-timer-hint">Notificările sunt oprite, așa că alarma sună doar cu aplicația deschisă.</small>
              : null)}
          </div>
          <button className="cook-up" onClick={() => setSheet(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
            Ingrediente
          </button>

          {sheet && (
            <>
              <div className="cook-dim" onClick={() => setSheet(false)} />
              <div className="cook-sheet" role="dialog" aria-label="Ingrediente">
                <button className="cook-grab" aria-label="Închide" onClick={() => setSheet(false)} />
                <h2>Ingrediente</h2>
                {forStep.length > 0 && <p className="set-label">Pentru pasul {i + 1}</p>}
                <ul className="checklist">
                  {[...r.ingredients.entries()]
                    .sort(([, a], [, b]) => Number(forStep.includes(b)) - Number(forStep.includes(a)))
                    .map(([k, x], pos) => isHeading(x) ? (
                      <li key={k}>
                        {pos === forStep.length && forStep.length > 0 && <p className="set-label">Toată rețeta</p>}
                        <p className="checklist-heading">{x.trim().replace(/:\s*$/, '')}</p>
                      </li>
                    ) : (
                      <li key={k} className={forStep.includes(x) ? 'now' : ''}>
                        {pos === forStep.length && forStep.length > 0 && <p className="set-label">Toată rețeta</p>}
                        <label className={have.has(k) ? 'done' : ''}>
                          <input type="checkbox" checked={have.has(k)} onChange={() => toggleHave(k)} />
                          <span>{x}</span>
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
