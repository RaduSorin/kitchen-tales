import { useSyncExternalStore } from 'react'

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
}

const KEY = 'kt-settings'
const LEGACY_BRIEF_KEY = 'kt-story-brief'
const DEFAULTS: Settings = { theme: 'auto', child: { name: '', canRead: false } }

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

export function getSettings() { return current }

export function updateSettings(patch: Partial<Omit<Settings, 'child'>> & { child?: Partial<ChildProfile> }) {
  current = { ...current, ...patch, child: { ...current.child, ...patch.child } }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage unavailable: keep in memory */ }
  applyTheme()
  listeners.forEach((l) => l())
}

export function useSettings() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getSettings)
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined

/** Sets data-theme on <html> and the browser's theme-color to match the chosen theme. */
export function applyTheme() {
  const dark = current.theme === 'dark' || (current.theme === 'auto' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131915' : '#f2f3ee')
}

media?.addEventListener('change', applyTheme)
