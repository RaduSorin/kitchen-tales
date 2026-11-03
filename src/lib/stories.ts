// Small helpers for the kids' stories area (night style).
import type { Story, StoryFolder, StorySource } from './types'

const COVERS = ['#ff9fb8', '#74e0d0', '#ffd76a', '#9fb4ff', '#c7a6ff', '#ffb38a']

export function coverColor(title: string) {
  let h = 0
  for (const c of title) h = (h * 31 + c.codePointAt(0)!) | 0
  return COVERS[Math.abs(h) % COVERS.length]
}

export const SOURCE_LABEL: Record<StorySource, string> = { recording: 'vocea noastră', generated: 'poveste nouă', upload: 'fișier audio' }
export const SOURCE_COLOR: Record<StorySource, string> = { recording: '#74e0d0', generated: '#ffd76a', upload: '#ff9fb8' }

// Shelf folder: the story's collection, otherwise how it was made.
const SOURCE_FOLDER: Record<StorySource, string> = { generated: 'Povești create de noi', recording: 'Vocea noastră', upload: 'Fișierele mele' }
export const folderOf = (s: Story) => s.collection || SOURCE_FOLDER[s.source]

/** The three folders every story falls into by how it was made; they cannot be renamed or deleted. */
export const isBuiltinFolder = (name: string) => Object.values(SOURCE_FOLDER).includes(name)
export const builtinFolderOf = (s: Pick<Story, 'source'>) => SOURCE_FOLDER[s.source]

export type Folder = { name: string; items: Story[]; icon?: string; row?: StoryFolder; builtin: boolean }

// Folders in shelf order (collections and our own folders first, alphabetically, then the built-in ones),
// each with its stories. `rows` adds the family's own folders, even while they are still empty.
export function groupFolders(stories: Story[], rows: StoryFolder[] = []): Folder[] {
  const map = new Map<string, Story[]>()
  for (const r of rows) map.set(r.name, [])
  for (const s of stories) map.set(folderOf(s), [...(map.get(folderOf(s)) ?? []), s])
  return [...map].map(([name, items]) => {
    const row = rows.find((r) => r.name === name)
    return { name, items, icon: row?.icon, row, builtin: isBuiltinFolder(name) }
  }).sort((a, b) => Number(a.builtin) - Number(b.builtin) || a.name.localeCompare(b.name, 'ro'))
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Why a folder name can't be used (empty, too long, or already taken ignoring diacritics), or '' if it can. */
export function folderNameProblem(name: string, taken: string[], current?: string) {
  const n = norm(name)
  if (!n) return 'Scrie un nume pentru folder.'
  if (name.trim().length > 40) return 'Numele e prea lung (cel mult 40 de litere).'
  if ([...taken, ...Object.values(SOURCE_FOLDER)].some((t) => t !== current && norm(t) === n)) return 'Există deja un folder cu acest nume.'
  return ''
}

/** Emojis to pick from for a folder. */
export const FOLDER_ICONS = ['🎵', '📚', '🌙', '⭐', '🐻', '🚗', '🦄', '🎄', '🌊', '🏰']

export function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 11 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara'
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Where each story was paused, and which story was played last (this device only).
const POS = (id: string) => `kt-story-pos-${id}`
const LAST = 'kt-last-story'
export function getPosition(id: string) {
  try { return +(localStorage.getItem(POS(id)) ?? 0) || 0 } catch { return 0 }
}
export function setPosition(id: string, sec: number | undefined) {
  try {
    if (!sec) localStorage.removeItem(POS(id))
    else localStorage.setItem(POS(id), String(Math.floor(sec)))
    localStorage.setItem(LAST, id)
  } catch { /* storage unavailable */ }
}
export function getLastStoryId() {
  try { return localStorage.getItem(LAST) ?? undefined } catch { return undefined }
}
