// One person's stamps and stickers on this device: `track()` counts what they just did, new
// badges wait in a queue to be celebrated (BadgeCelebration), and everything is kept on the
// phone and in the cloud (one BadgeBook row per account, merged with the phone's copy).
// Only what is done from the start (EPOCH) on counts: nothing from before badges existed.
import { useSyncExternalStore } from 'react'
import { BADGE } from './catalog'
import { applyEvent, emptyState, EPOCH, evaluate, mergeStates, type BadgeEvent, type BadgeState } from './engine'
import { onAccountChange, myUserId, spaceReady } from '../space'
import { isKidLocked } from '../kidMode'

const KEY = 'kt-badges' // a "kt-" key: dropped when another account signs in on this device
const SAVE_MS = 1500

/** A saved copy, or an empty one when it is from an older start (or unreadable). */
const parse = (raw: string | null | undefined): BadgeState => {
  try {
    const x = raw ? (JSON.parse(raw) as BadgeState) : undefined
    return x && x.epoch === EPOCH ? { ...emptyState(), ...x } : emptyState()
  } catch { return emptyState() }
}
const isCurrent = (raw: string) => { try { return (JSON.parse(raw) as BadgeState).epoch === EPOCH } catch { return false } }

const read = (): BadgeState => {
  try { return parse(localStorage.getItem(KEY)) } catch { return emptyState() }
}

let state = read()
/** Badges put off with "Mai târziu" in this session: kept for the album, not shown again now. */
let later = new Set<string>()
let pendingCache: string[] = []
const listeners = new Set<() => void>()

function recomputePending() {
  const seen = new Set(state.seen)
  const next = Object.keys(state.earned)
    .filter((id) => !seen.has(id) && !later.has(id) && BADGE.has(id))
    .sort((a, b) => state.earned[a].localeCompare(state.earned[b]))
  if (next.join() !== pendingCache.join()) pendingCache = next
}

function set(next: BadgeState, save = true) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full or blocked */ }
  recomputePending()
  listeners.forEach((l) => l())
  if (save) scheduleSave()
}

// ---- cloud ----

let saveTimer: ReturnType<typeof setTimeout> | undefined
let saving: Promise<void> | undefined
let cloudExists: boolean | undefined
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = undefined; void saveNow() }, SAVE_MS)
}

async function saveNow() {
  if (saving) { await saving; scheduleSave(); return }
  saving = (async () => {
    try {
      await spaceReady()
      const id = myUserId()
      if (!id || !navigator.onLine) return
      const { badgeBookApi } = await import('../db')
      // Another phone may have saved since: merge with the cloud's copy first.
      const row = await badgeBookApi.get(id)
      cloudExists = !!row
      const merged = row ? mergeStates(state, parse(row.state)) : state
      if (merged !== state) set(merged, false)
      await badgeBookApi.put(id, JSON.stringify(state), cloudExists)
      cloudExists = true
    } catch (err) {
      console.warn('badges: not saved yet', err)
      window.addEventListener('online', scheduleSave, { once: true })
    }
  })().finally(() => { saving = undefined })
  return saving
}


// ---- first start: the cloud copy ----

let starting: Promise<void> | undefined
/** Loads the cloud copy and starts the collection if it is new. Once per app start. */
export function startBadges() {
  return (starting ??= (async () => {
    await spaceReady()
    const id = myUserId()
    if (!id) return
    try {
      const { badgeBookApi } = await import('../db')
      const row = await badgeBookApi.get(id)
      cloudExists = !!row
      if (row) set(mergeStates(state, parse(row.state)), false)
      // The cloud still has badges from before the fresh start: replace them.
      if (row && !isCurrent(row.state)) scheduleSave()
    } catch { /* offline: carry on with the phone's copy */ }
    // A new collection starts today (the one-year stamp counts from here).
    if (!state.since) set({ ...state, since: new Date().toISOString() })
    // Anything due by now (the one-year stamp, a sticker held back yesterday).
    check()
  })().catch((err) => { starting = undefined; console.warn('badges: start', err) }))
}

/** Gives any badge whose goal is now reached (it then waits to be celebrated). */
function check() {
  const { state: next, fresh } = evaluate(state, new Date())
  if (fresh.length) set(next)
}

/** Counts something the person just did, and gives the badges it completes. */
export function track(e: BadgeEvent) {
  try {
    const now = new Date()
    const { state: next } = evaluate(applyEvent(state, e, now), now)
    // Nothing changed (a daytime "cook-opened"): no write, no cloud save.
    if (next !== state) set(next)
  } catch (err) { console.warn('badges: track', err) }
}

/** The badge was shown (a stamp) or stuck in the album (a sticker). */
export function markSeen(id: string) {
  if (state.seen.includes(id)) return
  later.delete(id)
  set({ ...state, seen: [...state.seen, id] })
}

/** "Mai târziu": not shown again in this session; it waits in the album to be stuck. */
export function putOff(id: string) {
  later = new Set(later).add(id)
  recomputePending()
  listeners.forEach((l) => l())
}

onAccountChange(() => {
  state = emptyState(); later = new Set(); starting = undefined; cloudExists = undefined
  recomputePending()
  listeners.forEach((l) => l())
})

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getBadgeState = () => state

/** The person's progress, kept fresh. */
export function useBadges() {
  return useSyncExternalStore(subscribe, () => state)
}

/** Badges earned but not yet celebrated, oldest first (none while the kid-mode lock screen is up). */
export function usePendingBadges() {
  const pending = useSyncExternalStore(subscribe, () => pendingCache)
  return isKidLocked() ? [] : pending
}

recomputePending()
