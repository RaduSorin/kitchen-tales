// The herbarium's book, kept in the encrypted vault (so it goes into the encrypted backup with
// the rest of Răgaz and never to the badges table in the cloud). After each save in Răgaz, and
// when Răgaz opens, it looks for plants that are now due (herbarium.ts).
import { useSyncExternalStore } from 'react'
import { getItem, putItem, useVault } from './vault'
import { listExercises, listMonths, listNotes, onMindSaved } from './store'
import { getChat } from './coach'
import { today } from './model'
import { AWAY_DAYS, daysBetween, earn, isProgramPack, progress, tally, type HerbBook, type HerbData } from './herbarium'
import { onAccountChange } from '../space'

const KIND = 'herb'
const ID = 'book'

let book: HerbBook | undefined
let hasProgram = false
let last: { data: HerbData; book: HerbBook } | undefined
/** Plants put off with "Mai târziu" in this session: they wait in the herbarium. */
let later = new Set<string>()
let pendingCache: string[] = []
const listeners = new Set<() => void>()

function recompute() {
  const seen = new Set(book?.seen ?? [])
  const next = Object.keys(book?.earned ?? {}).filter((id) => !seen.has(id) && !later.has(id))
    .sort((a, b) => book!.earned[a].localeCompare(book!.earned[b]))
  if (next.join() !== pendingCache.join()) pendingCache = next
}
const emit = () => { recompute(); listeners.forEach((l) => l()) }

async function save(next: HerbBook) {
  book = next
  emit()
  await putItem(KIND, ID, next)
}

/** The book, started today (with what is already in the vault set aside) when there is none. */
async function load(data: Pick<HerbData, 'months' | 'exercises'>) {
  if (book) return book
  const had = await getItem<HerbBook>(KIND, ID)
  if (had) { book = had; return had }
  const fresh: HerbBook = { v: 1, since: Date.now(), oldMonths: data.months.map((m) => m.id), oldExercises: data.exercises.map((e) => e.id), earned: {}, seen: [], lastVisit: today() }
  await save(fresh)
  return fresh
}

let running: Promise<void> | undefined
let again = false
let visitAsked = false
/**
 * Looks for plants now due. `visit`: Răgaz was just opened (for "Bine ai revenit"). Runs one
 * at a time; a call while one runs makes it run once more after.
 */
export function checkHerbarium(visit = false) {
  if (visit) visitAsked = true
  if (running) { again = true; return running }
  running = (async () => {
    try {
      do {
        again = false
        const isVisit = visitAsked
        visitAsked = false
        const [notes, months, exercises, chat] = await Promise.all([listNotes(), listMonths(), listExercises(), getChat()])
        let b = await load({ months, exercises })
        const day = today()
        const returned = isVisit && !!b.lastVisit && daysBetween(b.lastVisit, day) > AWAY_DAYS
        const data: HerbData = { notes, months, exercises, asked: chat.some((m) => m.role === 'user' && m.at >= b.since), returned, today: day }
        hasProgram = exercises.some((e) => isProgramPack(e.packTitle))
        const { book: next } = earn(b, data, new Date())
        b = isVisit && next.lastVisit !== day ? { ...next, lastVisit: day } : next
        last = { data, book: b }
        if (b !== book) await save(b)
        else emit()
      } while (again || visitAsked)
    } catch (err) {
      console.warn('herbarium: check', err)
    }
  })().finally(() => { running = undefined })
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
onMindSaved(() => { clearTimeout(timer); timer = setTimeout(() => { void checkHerbarium() }, 300) })
onAccountChange(() => { book = undefined; last = undefined; later = new Set(); hasProgram = false; emit() })

/** The plant was pressed into the herbarium. */
export async function markPressed(id: string) {
  if (!book || book.seen.includes(id)) return
  later.delete(id)
  await save({ ...book, seen: [...book.seen, id] })
}

/** "Mai târziu": not shown again now; it waits in the herbarium. */
export function putOffPlant(id: string) {
  later = new Set(later).add(id)
  emit()
}

/** The moment on or off ("quiet": plants wait in the herbarium). */
export async function setQuiet(quiet: boolean) {
  if (book) await save({ ...book, quiet })
}

/** [done, needed] for a plant not yet earned (from the last check). */
export function plantProgress(id: string): [number, number] {
  if (!last) return [0, 1]
  return progress(id, tally(last.book, last.data), last.data)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snap = () => book
export function useHerbBook() {
  return useSyncExternalStore(subscribe, snap)
}
export const herbHasProgram = () => hasProgram

/** Plants earned and not yet pressed, oldest first (only while the vault is open). */
export function usePendingPlants() {
  const pending = useSyncExternalStore(subscribe, () => pendingCache)
  return useVault().status === 'open' ? pending : []
}
