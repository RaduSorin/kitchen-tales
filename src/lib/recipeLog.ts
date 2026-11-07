// What the family remembers about each recipe: favourite, the days it was cooked and the notes
// written after cooking. Kept per space, so it works for recipes another space shared too, and
// offline first (cooking often happens with the phone far from the router).
import { useMemo } from 'react'
import { newId, recipeLogApi } from './db'
import { dayKey, fromKey, today } from './plan'
import { createSyncedList, useSyncedList } from './synced'
import type { CookNote, RecipeLog } from './types'

export const recipeLogStore = createSyncedList<RecipeLog>('recipe-log', recipeLogApi, 'favoritele și notele rețetelor')

const empty = (recipeId: string): RecipeLog => ({ id: '', recipeId, favorite: false, cooked: [], notes: [] })

/** The recipe's log; two rows made offline on two phones count as one. */
export function logOf(logs: RecipeLog[], recipeId: string): RecipeLog {
  const rows = logs.filter((l) => l.recipeId === recipeId)
  if (!rows.length) return empty(recipeId)
  if (rows.length === 1) return rows[0]
  return {
    ...rows[0],
    favorite: rows.some((l) => l.favorite),
    cooked: [...new Set(rows.flatMap((l) => l.cooked))].sort(),
    notes: rows.flatMap((l) => l.notes).sort((a, b) => a.day.localeCompare(b.day)),
  }
}

/** Every recipe's log, by recipe id. */
export function useRecipeLogs() {
  const logs = useSyncedList(recipeLogStore)
  return useMemo(() => {
    const ids = new Set(logs.map((l) => l.recipeId))
    return new Map([...ids].map((id) => [id, logOf(logs, id)]))
  }, [logs])
}

export function useRecipeLog(recipeId: string | undefined) {
  const logs = useSyncedList(recipeLogStore)
  return useMemo(() => (recipeId ? logOf(logs, recipeId) : undefined), [logs, recipeId])
}

function change(recipeId: string, edit: (l: RecipeLog) => RecipeLog) {
  const rows = recipeLogStore.get().filter((l) => l.recipeId === recipeId)
  const cur = logOf(recipeLogStore.get(), recipeId)
  const next = edit(cur)
  if (!rows.length) { recipeLogStore.create({ ...next, id: newId() }); return }
  // Fold duplicate rows into the first one.
  recipeLogStore.update({ ...next, id: rows[0].id })
  for (const extra of rows.slice(1)) recipeLogStore.remove(extra.id)
}

export function setRecipeFavorite(recipeId: string, favorite: boolean) {
  change(recipeId, (l) => ({ ...l, favorite }))
}

/** Counts the recipe as cooked today (once a day, however many times cooking mode is finished). */
export function markCooked(recipeId: string, day = dayKey(today())) {
  if (logOf(recipeLogStore.get(), recipeId).cooked.includes(day)) return
  change(recipeId, (l) => ({ ...l, cooked: [...l.cooked, day].sort() }))
}

export function addCookNote(recipeId: string, text: string, by?: string) {
  const t = text.trim().slice(0, 500)
  if (!t) return
  const note: CookNote = { day: dayKey(today()), text: t, ...(by ? { by } : {}) }
  change(recipeId, (l) => ({ ...l, notes: [...l.notes, note] }))
}

export function removeCookNote(recipeId: string, note: CookNote) {
  change(recipeId, (l) => ({ ...l, notes: l.notes.filter((n) => !(n.day === note.day && n.text === note.text && n.by === note.by)) }))
}

/** A deleted recipe leaves nothing behind. */
export function forgetRecipeLog(recipeId: string) {
  for (const l of recipeLogStore.get()) if (l.recipeId === recipeId) recipeLogStore.remove(l.id)
}

/** "azi", "ieri", "acum 5 zile", "acum 3 săptămâni", "acum 2 luni", "acum un an". */
export function sinceLabel(day: string) {
  const days = Math.round((today().getTime() - fromKey(day).getTime()) / 86_400_000)
  if (days <= 0) return 'azi'
  if (days === 1) return 'ieri'
  if (days < 7) return `acum ${days} zile`
  const weeks = Math.round(days / 7)
  if (days < 30) return weeks === 1 ? 'acum o săptămână' : `acum ${weeks} săptămâni`
  const months = Math.round(days / 30)
  if (days < 365) return months === 1 ? 'acum o lună' : `acum ${months} luni`
  const years = Math.round(days / 365)
  return years === 1 ? 'acum un an' : `acum ${years} ani`
}

/** "Gătită o dată · azi", "Gătită de 4 ori · ultima dată acum 3 săptămâni"; '' if never. */
export function cookedLabel(l: RecipeLog | undefined) {
  const n = l?.cooked.length ?? 0
  if (!n) return ''
  const last = l!.cooked[n - 1]
  const times = n === 1 ? 'o dată' : n < 20 ? `de ${n} ori` : `de ${n} de ori`
  const when = sinceLabel(last)
  return `Gătită ${times} · ${n === 1 ? when : `ultima dată ${when}`}`
}
