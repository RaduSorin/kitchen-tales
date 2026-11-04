import { useEffect, useSyncExternalStore } from 'react'

/**
 * "Are you sure you want to leave?" for screens with work that would be lost, like a recording
 * in progress. While a guard is on, taps on anything that leads to another screen (links, the
 * top bar and the tab bar, buttons marked data-leaves) are held back and a confirm sheet asks
 * first; if the parent says yes, the same tap goes through.
 */
export type LeaveGuard = { title: string; text: string; stay: string; leave: string }

let guard: LeaveGuard | undefined
let pending: HTMLElement | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

const LEAVES = 'a[href], [data-leaves], .topbar button, .tabbar button'

function onClick(e: MouseEvent) {
  if (!guard || pending) return
  const el = (e.target as Element | null)?.closest?.(LEAVES) as HTMLElement | null
  if (!el || el.closest('[data-leave-ok]')) return
  // Links that open somewhere else (new tab, download) don't take us off this screen.
  if (el instanceof HTMLAnchorElement && (el.target === '_blank' || el.hasAttribute('download'))) return
  e.preventDefault()
  e.stopPropagation()
  pending = el
  emit()
}
function onBeforeUnload(e: BeforeUnloadEvent) { if (guard) e.preventDefault() }

/** Turns the guard on while `active` is true. */
export function useLeaveGuard(active: boolean, g: LeaveGuard) {
  useEffect(() => {
    if (!active) return
    guard = g
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    emit()
    return () => {
      if (guard === g) guard = undefined
      pending = undefined
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
      emit()
    }
    // The texts are constants at the call site; only `active` turns the guard on and off.
  }, [active])
}

const snapshot = () => (pending && guard ? guard : undefined)
export const usePendingLeave = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, snapshot)

/** "Stay": forget the held-back tap. */
export function stayHere() { pending = undefined; emit() }

/** "Leave": drop the guard and replay the tap that was held back. */
export function leaveAnyway() {
  const el = pending
  guard = undefined
  pending = undefined
  document.removeEventListener('click', onClick, true)
  window.removeEventListener('beforeunload', onBeforeUnload)
  emit()
  el?.click()
}
