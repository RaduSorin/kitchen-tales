// Kid mode (parental control): the phone goes to the child with only the stories side,
// nothing that deletes, edits or moves, and an optional time limit that ends on a lock screen.
// The PIN and the choices (time, allowed folders) are the family's and live in the synced
// settings; whether kid mode is on, and until when, belongs to this device only, so turning it
// on for the phone does not lock the tablet.
import { useSyncExternalStore } from 'react'
import { getSettings, updateSettings } from './settings'
import { onAccountChange } from './space'
import { folderOf } from './stories'
import type { Story, StoryFolder } from './types'

export interface KidState {
  active: boolean
  /** When the time runs out (ms since epoch); null = no limit. */
  endsAt: number | null
  /** How long the time was when it was set or last extended (ms), for the draining ring. */
  total?: number
  /** The time ran out: only the PIN opens the app again. */
  locked: boolean
  /** Wrong PINs in a row, and until when the PIN pad waits after too many. */
  wrong: number
  waitUntil: number
}

const KEY = 'kt-kid'
const RESET_KEY = 'kt-kid-reset'
const OFF: KidState = { active: false, endsAt: null, locked: false, wrong: 0, waitUntil: 0 }

function read(): KidState {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...OFF, ...JSON.parse(raw) } : OFF } catch { return OFF }
}

let state = read()
const listeners = new Set<() => void>()

function set(patch: Partial<KidState>) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    state = read()
    listeners.forEach((l) => l())
  })
}

// Another account signed in on this device: the previous one's kid mode doesn't carry over.
onAccountChange(() => set(OFF))

export const getKid = () => state
export const isKidMode = () => state.active
export const isKidLocked = () => state.active && state.locked

export function useKid() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getKid)
}

/** Turns kid mode on for `minutes` (0 = no limit). */
export function startKid(minutes: number) {
  set({ active: true, locked: false, endsAt: minutes > 0 ? Date.now() + minutes * 60_000 : null, total: minutes * 60_000 })
}

/** More time: counted from now when the time already ran out, otherwise added to what is left. */
export function extendKid(minutes: number) {
  const base = state.endsAt && state.endsAt > Date.now() ? state.endsAt : Date.now()
  // The ring starts full again with the new time.
  set({ active: true, locked: false, endsAt: base + minutes * 60_000, total: base + minutes * 60_000 - Date.now() })
}

export const lockKid = () => set({ locked: true })
export const exitKid = () => set({ active: false, locked: false, endsAt: null })

/** How much of the time is left, 1 → 0 (for the ring), or null without a limit. */
export const kidFraction = (s: KidState = state, now = Date.now()) => {
  const left = kidLeft(s, now)
  if (left == null) return null
  const total = Math.max(s.total ?? 0, left, 1)
  return left / total
}

/** Milliseconds left, or null without a limit. */
export const kidLeft = (s: KidState = state, now = Date.now()) => (s.endsAt == null ? null : Math.max(0, s.endsAt - now))

// ---- PIN ----

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hashPin(pin: string, salt: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}

export const hasPin = () => !!getSettings().kid.pinHash

export async function setPin(pin: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  updateSettings({ kid: { pinSalt: salt, pinHash: await hashPin(pin, salt) } })
  set({ wrong: 0, waitUntil: 0 })
}

/** Seconds the PIN pad still waits after too many wrong tries (0 = can try). */
export const pinWait = (now = Date.now()) => Math.max(0, Math.ceil((state.waitUntil - now) / 1000))

/** Checks the PIN; after 5 wrong tries the pad waits 30 seconds, after each further one 2 minutes. */
export async function checkPin(pin: string): Promise<boolean> {
  const { pinHash, pinSalt } = getSettings().kid
  if (!pinHash || pinWait()) return false
  if (await hashPin(pin, pinSalt ?? '') === pinHash) { set({ wrong: 0, waitUntil: 0 }); return true }
  const wrong = state.wrong + 1
  set({ wrong, waitUntil: wrong < 5 ? 0 : Date.now() + (wrong === 5 ? 30_000 : 120_000) })
  return false
}

/**
 * Forgotten PIN: the parent signs out and back in with the account password. Marked before
 * signing out; after the next sign-in the PIN is cleared and kid mode turned off.
 */
export function markPinReset() { try { localStorage.setItem(RESET_KEY, '1') } catch { /* ignore */ } }
export function applyPinReset() {
  try { if (localStorage.getItem(RESET_KEY) !== '1') return; localStorage.removeItem(RESET_KEY) } catch { return }
  exitKid()
  set({ wrong: 0, waitUntil: 0 })
  updateSettings({ kid: { pinHash: undefined, pinSalt: undefined } })
}

// ---- what the child sees ----

/** Whether the child may see this folder (all folders when the parent picked none). */
export function kidAllowsFolder(name: string) {
  const { folders } = getSettings().kid
  return !state.active || !folders.length || folders.includes(name)
}
export const kidStories = (list: Story[]) => list.filter((s) => kidAllowsFolder(folderOf(s)))
export const kidFolderRows = (rows: StoryFolder[]) => rows.filter((r) => kidAllowsFolder(r.name))

/** Pages the child may open: the stories home, the shelf (folders, search, favourites) and the player. */
export const kidRouteAllowed = (path: string) => path === '/povesti' || /^\/povesti\/(?!adauga$)[^/]+$/.test(path)

/** Keeps the allowed-folders list right when a folder is renamed or deleted. */
export function kidFolderRenamed(oldName: string, name?: string) {
  const { folders } = getSettings().kid
  if (!folders.includes(oldName)) return
  const next = folders.filter((f) => f !== oldName)
  updateSettings({ kid: { folders: name ? [...next, name] : next } })
}
