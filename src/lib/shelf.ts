// How the stories in a folder are shown (squares, list, bookshelf, Cover Flow), which stories
// this device has already seen on the shelf, and the small click when you leaf through the books.
import { useSyncExternalStore, type CSSProperties, type InputHTMLAttributes } from 'react'
import type { Story } from './types'
import type { Tint } from './coverTint'
import { getSettings } from './settings'
import { fmtTime, getPosition } from './stories'

export type ShelfView = 'grid' | 'list' | 'shelf' | 'flow'
export const SHELF_VIEWS: ShelfView[] = ['grid', 'list', 'shelf', 'flow']
export const VIEW_LABEL: Record<ShelfView, string> = { grid: 'Pătrate', list: 'Listă', shelf: 'Raft cu vitrină', flow: 'Cover Flow' }
/** The two views that show the books as spines. */
export const isBookView = (v: ShelfView) => v === 'shelf' || v === 'flow'

const VIEWS = 'kt-folder-views'
const WIDE = 'kt-folder-view-wide'
const SEEN = 'kt-seen-stories'

function readJson<T>(key: string): T | undefined {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : undefined } catch { return undefined }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable: keep it for this visit only */ }
}

// ---------- The view of each folder (this device only) ----------

let views: Record<string, ShelfView> = readJson(VIEWS) ?? {}
let wide: ShelfView | undefined = readJson(WIDE)
const viewListeners = new Set<() => void>()
const isView = (v: unknown): v is ShelfView => SHELF_VIEWS.includes(v as ShelfView)

/**
 * The view for a folder. Upright, each folder keeps its own choice (squares by default). With the
 * phone turned sideways, the folder switches to the bookshelf: the one it already uses, or the one
 * last picked sideways (Cover Flow by default).
 */
export function folderView(folder: string, landscape: boolean): ShelfView {
  const own = isView(views[folder]) ? views[folder] : 'grid'
  if (!landscape) return own
  if (isView(wide)) return wide
  return isBookView(own) ? own : 'flow'
}

/** Remembers a choice: upright for this folder, sideways for every folder. */
export function setFolderView(folder: string, view: ShelfView, landscape: boolean) {
  if (landscape) { wide = view; writeJson(WIDE, view) }
  else { views = { ...views, [folder]: view }; writeJson(VIEWS, views) }
  viewListeners.forEach((l) => l())
}

/** Keeps the choice when a folder is renamed. */
export function renameFolderView(from: string, to: string) {
  if (!(from in views)) return
  const { [from]: v, ...rest } = views
  views = { ...rest, [to]: v }
  writeJson(VIEWS, views)
}

let version = 0
viewListeners.add(() => { version++ })
export function useFolderViews() {
  return useSyncExternalStore((l) => { viewListeners.add(l); return () => { viewListeners.delete(l) } }, () => version)
}

// ---------- The book last chosen in each folder (this device only) ----------
// Opening a story leaves the folder page, so the chosen book is kept here: back in the folder, the
// shelf and Cover Flow start from the book you opened or last looked at, not from the last one played.

const PICKS = 'kt-folder-picks'
let picks: Record<string, string> = readJson(PICKS) ?? {}
export const shelfPick = (folder: string): string | undefined => picks[folder]
export function rememberShelfPick(folder: string, id: string) {
  if (picks[folder] === id) return
  picks = { ...picks, [folder]: id }
  writeJson(PICKS, picks)
}

// ---------- Phone turned sideways ----------

// Phones only: a tablet on its side still has room for the usual layout.
const LANDSCAPE = '(orientation: landscape) and (max-height: 540px)'
const media = typeof window !== 'undefined' ? window.matchMedia(LANDSCAPE) : undefined
export function useLandscape() {
  return useSyncExternalStore(
    (l) => { media?.addEventListener('change', l); return () => media?.removeEventListener('change', l) },
    () => !!media?.matches,
  )
}

// ---------- Stories already seen on the shelf (this device only) ----------

/**
 * For each story this device has shown, the folder it was in then (a story moved to another folder
 * is new there). Undefined before the very first time.
 */
export type Seen = Record<string, string>
export function seenStories(): Seen | undefined {
  const map = readJson<Seen>(SEEN)
  return map && typeof map === 'object' && !Array.isArray(map) ? map : undefined
}
export function saveSeen(map: Seen) { writeJson(SEEN, map) }

/** "1 nouă" / "2 noi", for the badge on a folder. */
export const newLabel = (n: number) => `${n} ${n === 1 ? 'nouă' : 'noi'}`

// ---------- Book sizes ----------

/**
 * A spine is thicker for a longer story: 22 px up to 3 minutes, then 2.5 px more per minute, up to
 * 52 px from 15 minutes (so 6, 7 and 8 minutes are 30, 32 and 35 px); 36 px when the length is unknown.
 */
export function spineWidth(s: Pick<Story, 'durationSec'>) {
  if (!s.durationSec) return 36
  const min = Math.min(15, Math.max(3, s.durationSec / 60))
  return Math.round(22 + (min - 3) * 2.5)
}

/** Books on a shelf are not all the same height: 86–100% of the shelf's book height. */
export function spineHeight(title: string, full: number) {
  let h = 2166136261
  for (const c of title) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619) }
  return Math.round(full * (.86 + .14 * ((h >>> 0) % 1000) / 1000))
}

/** The colours and thickness of a book, as CSS variables for its spine, cover and pages. */
export const bookVars = (story: Pick<Story, 'durationSec'>, tint: Tint) =>
  ({ '--c': tint.spine, '--ink-c': tint.ink, '--cd': tint.dark, '--d': `${spineWidth(story)}px` }) as CSSProperties

/** "12 min · continuă de la 3:12": what the shelves show under the chosen book. */
export function bookMeta(story: Story) {
  const parts: string[] = []
  if (story.durationSec) parts.push(`${Math.max(1, Math.round(story.durationSec / 60))} min`)
  const pos = getPosition(story.id)
  parts.push(pos > 5 ? `continuă de la ${fmtTime(pos)}` : 'apasă pe copertă ca s-o asculți')
  return parts.join(' · ')
}

// ---------- The click and a short buzz when the chosen book changes ----------

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

/** A tiny buzz on Android (iPhone has no navigator.vibrate; see the switch below). */
function buzz(ms = 10) {
  if (!canVibrate) return
  try { navigator.vibrate(ms) } catch { /* not allowed right now */ }
}

/**
 * iPhone ticks when its native switch (<input type="checkbox" switch>, iOS 18+) is flipped by the
 * finger itself, and not when a script flips it. So the places you tap on the shelves (the spines,
 * the Cover Flow stage, the ‹ › buttons) are labels of a hidden switch: a real tap on them flips it
 * and the phone ticks. A slide is not a tap, so there is no tick while the finger slides.
 * Spread these attributes into the hidden <input> (React does not know `switch`).
 */
export const NATIVE_SWITCH = { type: 'checkbox', switch: '', className: 'sr-only', tabIndex: -1, 'aria-hidden': true } as InputHTMLAttributes<HTMLInputElement>

/** Whether a tap on a switch label may tick: the setting is on and the tap did something. */
export const tickAllowed = (didSomething = true) => didSomething && getSettings().shelfClick

let audio: AudioContext | undefined
/** Called from a tap so iOS lets the page make sounds afterwards. */
export function primeClick() {
  if (!getSettings().shelfClick) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') audio.resume().catch(() => {})
  } catch { /* no Web Audio */ }
}
/** The chosen book changed: a click, and a buzz on Android (iPhone ticks through the switch labels). */
export function shelfClick() {
  if (!getSettings().shelfClick) return
  buzz()
  playClick()
}
function playClick() {
  try {
    audio ??= new AudioContext()
    if (audio.state !== 'running') return
    const t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 1300 + Math.random() * 250
    gain.gain.setValueAtTime(.05, t)
    gain.gain.exponentialRampToValueAtTime(.0001, t + .05)
    osc.connect(gain).connect(audio.destination)
    osc.start(t)
    osc.stop(t + .06)
  } catch { /* no Web Audio */ }
}

/** The "Încearcă" button in the settings: a buzz (Android; iPhone ticks through its switch label) and a click. */
export async function tryShelfClick() {
  buzz(30)
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') await audio.resume()
  } catch { /* no Web Audio */ }
  playClick()
}

// ---------- Little helpers for the arrival animations ----------

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? 0 : ms))
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** A puff of moon dust where a new book lands. */
export function moonDust(layer: HTMLElement | null, x: number, y: number, n = 12) {
  if (!layer || reducedMotion()) return
  for (let k = 0; k < n; k++) {
    const d = document.createElement('i')
    const a = Math.PI * (1 + Math.random()), dist = 30 + Math.random() * 50
    d.className = 'moon-dust'
    d.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist * .6}px;animation-delay:${Math.random() * 80}ms`
    layer.append(d)
    setTimeout(() => d.remove(), 1000)
  }
}
