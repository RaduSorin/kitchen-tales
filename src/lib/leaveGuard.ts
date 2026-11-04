import { useEffect, useSyncExternalStore } from 'react'

/**
 * "Are you sure you want to leave?" for screens with work that would be lost, like a recording
 * in progress or an unsaved recipe. While a guard is on:
 * - taps on anything that leads to another screen (links, the top bar and the tab bar, buttons
 *   marked data-leaves) are held back and a confirm sheet asks first; if the parent says yes,
 *   the same tap goes through;
 * - going back through history (the iPhone swipe from the left edge, the browser's Back) asks
 *   too. A copy of the current history entry is pushed when the guard turns on, so "back" only
 *   leaves that copy and the screen stays as it is while the sheet asks.
 * Guards can be nested (a recording inside an editor); the innermost one's texts are shown.
 */
export type LeaveGuard = { title: string; text: string; stay: string; leave: string }

const MARK = 'ktLeaveGuard'
const stack: LeaveGuard[] = []
/** What is held back: a tap to replay, or 'back' for a history step back. */
let pending: HTMLElement | 'back' | undefined
let guardedUrl = ''
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

const LEAVES = 'a[href], [data-leaves], .topbar button, .tabbar button'

const onCopy = () => !!(window.history.state as Record<string, unknown> | null)?.[MARK]
function pushCopy() {
  window.history.pushState({ ...(window.history.state as object | null), [MARK]: true }, '', guardedUrl || undefined)
}

// Steps back that this module makes itself (to drop the copy) are hidden from the router.
let ownPops = 0
let popWaiters: (() => void)[] = []
let settling: Promise<void> = Promise.resolve()
function dropCopy(): Promise<void> {
  if (ownPops || !onCopy()) return settling
  ownPops++
  settling = new Promise((resolve) => {
    const done = () => { clearTimeout(t); resolve() }
    // If the browser never reports the step, don't wait (or swallow a later one) forever.
    const t = setTimeout(() => { ownPops = 0; popWaiters = popWaiters.filter((f) => f !== done); resolve() }, 600)
    popWaiters.push(done)
  })
  window.history.back()
  return settling
}

function onPop(e: PopStateEvent) {
  if (ownPops) {
    ownPops--
    e.stopImmediatePropagation()
    popWaiters.splice(0).forEach((f) => f())
    return
  }
  if (!stack.length) return
  // Back while guarded: we are on the entry under the copy, the screen is still here. Ask.
  e.stopImmediatePropagation()
  if (!pending) { pending = 'back'; emit() }
}
// Capture on window runs before React Router's own listener, so a held-back step never reaches it.
if (typeof window !== 'undefined') window.addEventListener('popstate', onPop, true)

function onClick(e: MouseEvent) {
  if (!stack.length || pending) return
  const el = (e.target as Element | null)?.closest?.(LEAVES) as HTMLElement | null
  if (!el || el.closest('[data-leave-ok]')) return
  // Links that open somewhere else (new tab, download) don't take us off this screen.
  if (el instanceof HTMLAnchorElement && (el.target === '_blank' || el.hasAttribute('download'))) return
  e.preventDefault()
  e.stopPropagation()
  pending = el
  emit()
}
function onBeforeUnload(e: BeforeUnloadEvent) { if (stack.length) e.preventDefault() }

function turnOn(g: LeaveGuard) {
  stack.push(g)
  if (stack.length === 1) {
    guardedUrl = window.location.href
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    settling.then(() => { if (stack.length && !onCopy()) pushCopy() })
  }
  emit()
}
function stopListening() {
  document.removeEventListener('click', onClick, true)
  window.removeEventListener('beforeunload', onBeforeUnload)
}
function turnOff(g: LeaveGuard) {
  const k = stack.lastIndexOf(g)
  if (k < 0) return
  stack.splice(k, 1)
  if (!stack.length) {
    pending = undefined
    stopListening()
    dropCopy()
  }
  emit()
}

/** Turns the guard on while `active` is true. */
export function useLeaveGuard(active: boolean, g: LeaveGuard) {
  useEffect(() => {
    if (!active) return
    turnOn(g)
    return () => turnOff(g)
    // The texts are constants at the call site; only `active` turns the guard on and off.
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The guarded work is done (e.g. saved) and the screen is about to move on: turn every guard
 * off now, without waiting for React, and resolve once history is tidy (the copy entry gone).
 * Await it before navigating, or the copy would stay behind as an extra Back step.
 */
export function guardedWorkDone(): Promise<void> {
  stack.length = 0
  pending = undefined
  stopListening()
  emit()
  return dropCopy()
}

const snapshot = () => (pending ? stack[stack.length - 1] : undefined)
export const usePendingLeave = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, snapshot)

/** "Stay": forget the held-back tap or step back. */
export function stayHere() {
  if (pending === 'back') pushCopy()
  pending = undefined
  emit()
}

/** "Leave": drop every guard and go where the parent was going. */
export function leaveAnyway() {
  const what = pending
  stack.length = 0
  pending = undefined
  stopListening()
  emit()
  if (what === 'back') window.history.back()
  else if (what) dropCopy().then(() => what.click())
}
