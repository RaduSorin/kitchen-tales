// What Răgaz keeps in the vault (vault.ts), and the calendar helpers around it. All of it is
// encrypted on the phone; only exercise packs shared in the family go to the server (packs.ts).

/** One exercise in the person's own bank: from a pack (and maybe changed), or written by them. */
export type Exercise = {
  id: string
  title: string
  /** e.g. "Compasiune de sine", "Conștientizare". */
  category?: string
  minutes?: number
  /** What to do, as plain text (paragraphs separated by empty lines). */
  steps: string
  /** The pack it came from, and whether it was changed since. None: written by the person. */
  packId?: string
  packTitle?: string
  edited?: boolean
}

/** One Friday of the month and the exercise chosen for it. */
export type Friday = { date: string; exerciseId?: string; title: string }

/** The month's plan: the intention, what success looks like, and the Friday themes. */
export type MonthPlan = {
  /** "2026-12" */
  id: string
  intention: string
  /** The sign of success, e.g. "Mă culc înainte de 23:00", and how many Fridays make the month a good one. */
  success?: string
  target?: number
  fridays: Friday[]
  savedAt: number
}

/** A note after an exercise (or any day). The first fields are the structured line the monthly summary uses. */
export type Note = {
  id: string
  /** The day it is about, YYYY-MM-DD. */
  date: string
  month: string
  exerciseId?: string
  title?: string
  /** How strong the feeling was before and after, 0–10. */
  before?: number
  after?: number
  fit?: 'da' | 'partial' | 'nu'
  text: string
  createdAt: number
}

// The vault's kinds (vault.ts keeps one encrypted record per item).
export const KIND = { exercise: 'exercise', month: 'month', note: 'note' } as const

// ---- dates (local time, as the phone shows them) ----

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthId = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => isoDay(new Date())
export const thisMonth = () => monthId(new Date())
export const nextMonth = (id: string) => { const [y, m] = id.split('-').map(Number); return monthId(new Date(y, m, 1)) }

/** The Fridays of a month, as YYYY-MM-DD; with `from`, only those on or after that day. */
export function fridaysOf(id: string, from?: string) {
  const [y, m] = id.split('-').map(Number)
  const out: string[] = []
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5 && (!from || isoDay(d) >= from)) out.push(isoDay(d))
  }
  return out
}

/** The next Friday from today (today itself on a Friday). */
export function nextFriday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return isoDay(d)
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
export const monthName = (id: string) => MONTHS[Number(id.split('-')[1]) - 1]
export const dayName = (s: string) => { const d = parseDay(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }

/**
 * Proposes a theme for each Friday from the bank: exercises not used in the last months first,
 * in bank order, so a month doesn't repeat itself and the program's order is kept.
 */
export function proposeFridays(dates: string[], bank: Exercise[], recentlyUsed: string[] = []): Friday[] {
  const fresh = bank.filter((e) => !recentlyUsed.includes(e.id))
  const pool = [...fresh, ...bank.filter((e) => recentlyUsed.includes(e.id))]
  return dates.map((date, i) => {
    const e = pool.length ? pool[i % pool.length] : undefined
    return { date, exerciseId: e?.id, title: e?.title ?? '' }
  })
}
