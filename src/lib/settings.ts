import { useSyncExternalStore } from 'react'
import { SKY_TOP, type SkyPhase } from './sun'

export type ThemeChoice = 'auto' | 'light' | 'dark'

export interface ChildProfile {
  name: string
  /** Year of birth; the age is worked out from it so it never goes stale. */
  birthYear?: number
  gender?: 'boy' | 'girl'
  canRead: boolean
}

export interface Settings {
  theme: ThemeChoice
  child: ChildProfile
  /** Appliances the family has, used when generating recipes. */
  kitchenTools: string[]
  /** Where we live, roughly: the stories sky follows sunrise and sunset there. */
  city: string
}

const KEY = 'kt-settings'
const LEGACY_BRIEF_KEY = 'kt-story-brief'
const DEFAULTS: Settings = { theme: 'auto', child: { name: '', canRead: false }, kitchenTools: [], city: 'București' }

// Earlier versions stored the age; turn it into a birth year once.
function migrateChild(c: ChildProfile & { age?: number }): ChildProfile {
  const { age, ...rest } = c
  if (rest.birthYear || !age) return rest
  return { ...rest, birthYear: new Date().getFullYear() - age }
}

/** The child's age this year, from the birth year (at least 1), or undefined if not set. */
export function childAge(child: ChildProfile, now = new Date()) {
  return child.birthYear ? Math.max(1, now.getFullYear() - child.birthYear) : undefined
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>
      return { ...DEFAULTS, ...s, child: migrateChild({ ...DEFAULTS.child, ...s.child }) }
    }
    // First run after the redesign: carry over the child details from the story form.
    const brief = JSON.parse(localStorage.getItem(LEGACY_BRIEF_KEY) ?? '{}')
    return { ...DEFAULTS, child: migrateChild({ ...DEFAULTS.child, name: brief.childName ?? '', age: brief.age, gender: brief.gender }) }
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()
const sharedListeners = new Set<() => void>()

/** Settings shared by the family and kept in the cloud; the theme stays per device. */
export type SharedSettings = Pick<Settings, 'child' | 'city' | 'kitchenTools'>
const SHARED_KEYS = ['child', 'city', 'kitchenTools'] as const

export function getSettings() { return current }

type Patch = Partial<Omit<Settings, 'child'>> & { child?: Partial<ChildProfile> }

function set(patch: Patch) {
  current = { ...current, ...patch, child: { ...current.child, ...patch.child } }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage unavailable: keep in memory */ }
  applyTheme()
  listeners.forEach((l) => l())
}

export function updateSettings(patch: Patch) {
  set(patch)
  if (SHARED_KEYS.some((k) => k in patch)) sharedListeners.forEach((l) => l())
}

/** Called after a change to a shared setting on this device (used to send it to the cloud). */
export function onSharedChange(fn: () => void) {
  sharedListeners.add(fn)
  return () => { sharedListeners.delete(fn) }
}

/** Takes the family's settings from the cloud without counting it as a local change. */
export function applySharedSettings(s: Partial<SharedSettings>) {
  set({ ...s, child: s.child ? { ...DEFAULTS.child, ...s.child } : undefined })
}

// Another tab or window of the app changed the settings: use them here too, so this one
// does not later write its old copy back over them.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    current = read()
    applyTheme()
    listeners.forEach((l) => l())
  })
}

export function useSettings() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getSettings)
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined

/** Sets data-theme on <html> and the browser's theme-color to match the chosen theme. */
export function applyTheme() {
  const dark = current.theme === 'dark' || (current.theme === 'auto' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const { area, sky } = document.documentElement.dataset
  setStatusBarColor(area === 'night' ? SKY_TOP[(sky as SkyPhase) ?? 'night'] ?? '#171a45' : dark ? '#131915' : '#f2f3ee')
}

/**
 * Colors the phone's status bar. iOS home-screen apps ignore a changed `content` on the existing
 * theme-color tag, but do pick up a freshly inserted one, so the tag is replaced instead of edited.
 */
export function setStatusBarColor(color: string) {
  const old = document.querySelector('meta[name="theme-color"]')
  if (old?.getAttribute('content') === color) return
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = color
  old?.remove()
  document.head.appendChild(meta)
}

media?.addEventListener('change', applyTheme)
