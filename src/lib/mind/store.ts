// Răgaz's data, read and written through the encrypted vault (vault.ts). Every call needs the
// vault open; the pages sit behind the unlock gate.

import { getItem, listItems, putItem, removeItem } from './vault'
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
export const saveMonth = (m: MonthPlan) => putItem(KIND.month, m.id, { ...m, savedAt: Date.now() })
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
