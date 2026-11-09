// Răgaz's data, read and written through the encrypted vault (vault.ts). Every call needs the
// vault open; the pages sit behind the unlock gate.

import { getItem, getLocal, listItems, putItem, removeItem, setLocal } from './vault'
import { KIND, type Exercise, type MonthPlan, type Note } from './model'

const byTitle = (a: Exercise, b: Exercise) => a.title.localeCompare(b.title, 'ro')

// ---- the exercise bank ----

/** The person's bank: imported packs first, in their own order, then exercises they wrote, by title. */
export async function listExercises() {
  const all = (await listItems<Exercise & { order?: number }>(KIND.exercise)).map((i) => i.value)
  const packed = all.filter((e) => e.packId).sort((a, b) => (a.packTitle ?? '').localeCompare(b.packTitle ?? '', 'ro') || (a.order ?? 0) - (b.order ?? 0))
  return [...packed, ...all.filter((e) => !e.packId).sort(byTitle)] as Exercise[]
}

export const getExercise = (id: string) => getItem<Exercise>(KIND.exercise, id)
export const saveExercise = (e: Exercise & { order?: number }) => putItem(KIND.exercise, e.id, e)
export const removeExercise = (id: string) => removeItem(KIND.exercise, id)

// ---- months ----

export const getMonth = (id: string) => getItem<MonthPlan>(KIND.month, id)
export async function saveMonth(m: MonthPlan) {
  await putItem(KIND.month, m.id, { ...m, savedAt: Date.now() })
  await rememberPlanned([m])
}

/** Notes on this phone which months are planned and which Fridays have a theme (for the Home card). */
export async function rememberPlanned(months: MonthPlan[]) {
  const planned = { ...(await getLocal()).planned }
  for (const m of months) planned[m.id] = m.fridays.filter((f) => f.exerciseId || f.title).map((f) => f.date)
  await setLocal({ planned })
}
export async function listMonths() {
  return (await listItems<MonthPlan>(KIND.month)).map((i) => i.value).sort((a, b) => b.id.localeCompare(a.id))
}

// ---- notes ----

export const saveNote = (n: Note) => putItem(KIND.note, n.id, n)
export const removeNote = (id: string) => removeItem(KIND.note, id)
/** Newest first. */
export async function listNotes() {
  return (await listItems<Note>(KIND.note)).map((i) => i.value).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}
