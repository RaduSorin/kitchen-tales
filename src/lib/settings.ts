import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'

export interface ChildProfile {
  name: string
  age?: number
  gender?: 'boy' | 'girl'
  canRead: boolean
}

export interface Settings {
  theme: ThemeChoice
  child: ChildProfile
  /** Appliances the family has, used when generating recipes. */
  kitchenTools: string[]
}

const KEY = 'kt-settings'
const LEGACY_BRIEF_KEY = 'kt-story-brief'
const DEFAULTS: Settings = { theme: 'auto', child: { name: '', canRead: false }, kitchenTools: [] }

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>
      return { ...DEFAULTS, ...s, child: { ...DEFAULTS.child, ...s.child } }
    }
    // First run after the redesign: carry over the child details from the story form.
    const brief = JSON.parse(localStorage.getItem(LEGACY_BRIEF_KEY) ?? '{}')
    return { ...DEFAULTS, child: { ...DEFAULTS.child, name: brief.childName ?? '', age: brief.age, gender: brief.gender } }
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
