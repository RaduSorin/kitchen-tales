// Exercise packs shared in the space (ExercisePack in amplify/data/resource.ts). A pack is the
// only part of Răgaz that lives on the server in the clear: exercises, never anything the person
// wrote about themselves. Importing makes the person's own copy in the encrypted bank.

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../../amplify/data/resource'
import { mySpaceGroup, spaceReady } from '../space'
import type { Exercise } from './model'
import { listExercises, saveExercise } from './store'

const client = generateClient<Schema>()

export type PackExercise = Pick<Exercise, 'title' | 'category' | 'minutes' | 'steps'>
export type Pack = { id: string; title: string; description?: string; author?: string; exercises: PackExercise[] }

const clean = (e: Partial<PackExercise>): PackExercise | undefined => {
  const title = String(e.title ?? '').trim().slice(0, 120)
  if (!title) return undefined
  return {
    title,
    category: e.category ? String(e.category).trim().slice(0, 60) : undefined,
    minutes: Number.isFinite(Number(e.minutes)) && Number(e.minutes) > 0 ? Math.round(Number(e.minutes)) : undefined,
    steps: String(e.steps ?? '').slice(0, 8000),
  }
}

function toPack(r: Schema['ExercisePack']['type']): Pack {
  let list: Partial<PackExercise>[] = []
  try { list = JSON.parse(r.exercises) } catch { /* a broken pack shows as empty */ }
  return { id: r.id, title: r.title, description: r.description ?? undefined, author: r.author ?? undefined, exercises: list.map(clean).filter((e): e is PackExercise => !!e) }
}

export async function listPacks(): Promise<Pack[]> {
  await spaceReady()
  const out: Pack[] = []
  let token: string | null | undefined
  do {
    const page = await client.models.ExercisePack.list({ nextToken: token })
    if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '))
    out.push(...page.data.map(toPack))
    token = page.nextToken
  } while (token)
  return out.sort((a, b) => a.title.localeCompare(b.title, 'ro'))
}

/** Shares exercises as a pack in the space (a new pack, or a new version of one the person made). */
export async function sharePack(p: { id?: string; title: string; description?: string; author?: string; exercises: PackExercise[] }) {
  const row = {
    title: p.title.trim().slice(0, 120),
    description: p.description?.trim().slice(0, 500) || null,
    author: p.author?.trim().slice(0, 60) || null,
    exercises: JSON.stringify(p.exercises.map(clean).filter(Boolean)),
  }
  const res = p.id
    ? await client.models.ExercisePack.update({ id: p.id, ...row })
    : await client.models.ExercisePack.create({ ...row, spaceGroups: [await mySpaceGroup()] })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Pachetul nu s-a salvat.')
  return toPack(res.data)
}

export async function deletePack(id: string) {
  const res = await client.models.ExercisePack.delete({ id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

/**
 * Imports a pack into the bank. Exercises already imported from it and not changed since are
 * updated; changed ones and the person's own stay as they are. Returns how many were added.
 */
export async function importPack(pack: Pack) {
  const mine = (await listExercises()).filter((e) => e.packId === pack.id)
  const byTitle = new Map(mine.map((e) => [e.title.toLowerCase(), e]))
  let added = 0
  for (const [order, x] of pack.exercises.entries()) {
    const had = byTitle.get(x.title.toLowerCase())
    if (had?.edited) continue
    if (!had) added++
    await saveExercise({ ...x, id: had?.id ?? crypto.randomUUID(), packId: pack.id, packTitle: pack.title, order })
  }
  return added
}

/**
 * Reads a pack from pasted text: JSON ({title, exercises:[…]} or just the list), or plain text
 * where each exercise starts with a "## Title" line (optionally "Categorie · 10 min" on the next).
 */
export function parsePackText(text: string): { title?: string; exercises: PackExercise[] } {
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t) as { title?: string; exercises?: Partial<PackExercise>[] } | Partial<PackExercise>[]
      const list = Array.isArray(j) ? j : j.exercises ?? []
      return { title: Array.isArray(j) ? undefined : j.title, exercises: list.map(clean).filter((e): e is PackExercise => !!e) }
    } catch { /* not JSON after all: read as text */ }
  }
  const out: PackExercise[] = []
  let title: string | undefined
  for (const block of t.split(/^(?=#{1,2} )/m)) {
    const lines = block.split('\n')
    const head = lines[0].match(/^(#{1,2}) (.+)/)
    if (!head) continue
    if (head[1] === '#' && !out.length && !title) { title = head[2].trim(); continue }
    let rest = lines.slice(1)
    const meta = rest[0]?.match(/^\s*(?:([^·\d][^·]*?)\s*·\s*)?(\d+)\s*min\b/i)
    let category: string | undefined
    let minutes: number | undefined
    if (meta) { category = meta[1]?.trim(); minutes = Number(meta[2]); rest = rest.slice(1) }
    const e = clean({ title: head[2], category, minutes, steps: rest.join('\n').trim() })
    if (e) out.push(e)
  }
  return { title, exercises: out }
}
