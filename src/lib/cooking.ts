// Helpers for the step-by-step cooking mode.
import { parseQuantity } from './scale'

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const WORD_NUMBERS: Record<string, number> = {
  o: 1, un: 1, una: 1, doua: 2, doi: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
  cincisprezece: 15, douazeci: 20, treizeci: 30, patruzeci: 40,
}
const UNIT_SECONDS: [RegExp, number][] = [
  [/^(?:ore|ora|h)$/, 3600],
  [/^(?:minute|minut|min)$/, 60],
  [/^(?:secunde|secunda|sec|s)$/, 1],
]

// "10 minute", "5-7 min", "o oră", "1 oră și 30 de minute", "2,5 ore", "jumătate de oră"
const DURATION = /(\d+(?:[.,]\d+)?|[a-z]+)(?:\s*(?:-|–|sau)\s*(\d+(?:[.,]\d+)?))?\s*(?:de\s+)?(ore|ora|h|minute|minut|min|secunde|secunda|sec)\b/g

/** Total seconds of the durations mentioned in a step, or 0 if none. Ranges use the upper bound. */
export function detectDuration(text: string): number {
  const t = norm(text)
  if (/jumatate de ora/.test(t)) return 1800
  let total = 0
  for (const m of t.matchAll(DURATION)) {
    const raw = m[2] ?? m[1]
    const n = /\d/.test(raw) ? parseFloat(raw.replace(',', '.')) : WORD_NUMBERS[raw]
    if (!n) continue
    const unit = UNIT_SECONDS.find(([re]) => re.test(m[3]))?.[1] ?? 60
    total += n * unit
  }
  return Math.round(total)
}

const STOP = new Set(['de', 'cu', 'si', 'la', 'din', 'pentru', 'sau', 'mare', 'mic', 'mica', 'mari', 'proaspat', 'proaspata', 'tocat', 'tocata', 'buc', 'bucati', 'bucata',
  'g', 'gr', 'kg', 'ml', 'l', 'lingura', 'linguri', 'lingurita', 'lingurite', 'lg', 'lgt', 'cana', 'cani', 'praf', 'varf', 'catel', 'catei', 'felie', 'felii', 'pachet', 'plic', 'dupa', 'gust'])

/** The main word of an ingredient line, e.g. "500 g carne tocată" → "carne". */
function keyword(line: string) {
  const rest = parseQuantity(line)?.rest ?? line
  return norm(rest).split(/[^a-z]+/).find((w) => w.length >= 3 && !STOP.has(w))
}

/** Ingredient lines that a step seems to mention. Matches on a 4-letter stem so "ceapa" finds "ceapă mare". */
export function ingredientsForStep(step: string, ingredients: string[]) {
  const words = norm(step).split(/[^a-z]+/)
  return ingredients.filter((line) => {
    const k = keyword(line)
    if (!k) return false
    const stem = k.slice(0, Math.min(k.length, 4))
    return words.some((w) => w.startsWith(stem))
  })
}

export function formatClock(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// ---- step timers ----

/**
 * A step's timer. While it runs, only its end time is kept and the seconds left are worked out
 * from the clock, so it stays right after the phone was locked or the app was in the background
 * (iOS pauses the page then). `push`: a notification is scheduled for the end. `title`: the
 * recipe's, for the alarm shown outside cooking mode.
 */
export type CookTimer = { total: number; left: number; endsAt?: number; push?: boolean; title?: string }

// Timers survive leaving cook mode (to look at the recipe) and reloading, per recipe.
export const TIMERS_PREFIX = 'kt-cook-timers-'
export function loadTimers(id: string): Record<number, CookTimer> {
  try { return JSON.parse(localStorage.getItem(TIMERS_PREFIX + id) ?? '{}') } catch { return {} }
}
export function saveTimers(id: string, timers: Record<number, CookTimer>) {
  try {
    if (Object.keys(timers).length) localStorage.setItem(TIMERS_PREFIX + id, JSON.stringify(timers))
    else localStorage.removeItem(TIMERS_PREFIX + id)
  } catch { /* storage unavailable */ }
}

// Remembers the step you stopped at, per recipe, on this device.
const progressKey = (id: string) => `kt-cook-${id}`
const LAST_COOK = 'kt-last-cook'
export function getProgress(id: string): number | undefined {
  try { const v = localStorage.getItem(progressKey(id)); return v == null ? undefined : +v } catch { return undefined }
}
export function setProgress(id: string, step: number | undefined) {
  try {
    if (step == null) localStorage.removeItem(progressKey(id))
    else { localStorage.setItem(progressKey(id), String(step)); localStorage.setItem(LAST_COOK, id) }
  } catch { /* storage unavailable */ }
}
/** The recipe last cooked step by step on this device, if it isn't finished yet. */
export function getLastCook() {
  try {
    const id = localStorage.getItem(LAST_COOK) ?? undefined
    const step = id ? getProgress(id) : undefined
    return id && step != null ? { id, step } : undefined
  } catch { return undefined }
}
