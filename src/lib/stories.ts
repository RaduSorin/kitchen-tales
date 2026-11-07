// Small helpers for the kids' stories area (night style).
import type { Story, StoryFolder, StorySource } from './types'

/**
 * The illustrated cover of a story without a picture (design "Seară de lux"): a sky from `top`
 * to `bottom`, a soft `glow` behind the emoji and two hills in `hill`. Chosen when the story is
 * added (`Story.scene`), otherwise picked from the title, so a story always gets the same one.
 */
export interface CoverScene { top: string; bottom: string; glow: string; hill: string }
export const SCENES: CoverScene[] = [
  { top: '#c8324a', bottom: '#5a1630', glow: '#ff9fb0', hill: '#3a0f22' },
  { top: '#3f7fd0', bottom: '#16245e', glow: '#bfe3ff', hill: '#0e1a44' },
  { top: '#e08a3a', bottom: '#7a3415', glow: '#ffd9a0', hill: '#4a1f0c' },
  { top: '#4c9a6a', bottom: '#164a3a', glow: '#d3f5c9', hill: '#0b2e24' },
  { top: '#d9759a', bottom: '#5e2a6e', glow: '#ffd1e3', hill: '#3a1745' },
  { top: '#5a54c8', bottom: '#151248', glow: '#fff1a8', hill: '#0b0a2e' },
  { top: '#d3a63a', bottom: '#6e4a12', glow: '#fff0b8', hill: '#3e2808' },
  { top: '#7fb5d9', bottom: '#2f4f8a', glow: '#e6f6ff', hill: '#1b2e5a' },
]

/** Shown behind a cover picture, so a transparent PNG doesn't let the coloured emoji tile show through. */
export const COVER_IMG_BG = '#f4efe6'

export function coverScene(title: string, scene?: number) {
  if (scene != null && SCENES[scene]) return SCENES[scene]
  return SCENES[sceneIndex(title)]
}

/** The scene a title gets when none was chosen. */
export function sceneIndex(title: string) {
  let h = 0
  for (const c of title) h = (h * 31 + c.codePointAt(0)!) | 0
  return Math.abs(h) % SCENES.length
}

/** The main colour of a story's illustrated cover (its sky), e.g. for a spine or the glow. */
export function coverColor(title: string, scene?: number) {
  return coverScene(title, scene).top
}

export const SOURCE_LABEL: Record<StorySource, string> = { recording: 'vocea noastră', generated: 'poveste nouă', upload: 'fișier audio' }
export const SOURCE_COLOR: Record<StorySource, string> = { recording: '#74e0d0', generated: '#ffd76a', upload: '#ff9fb8' }

// Shelf folder: the story's collection, otherwise how it was made.
const SOURCE_FOLDER: Record<StorySource, string> = { generated: 'Povești create de noi', recording: 'Vocea noastră', upload: 'Fișierele mele' }
// A story another space shared sits in that space's folder, named so it never clashes with ours.
export const receivedFolderName = (collection: string | undefined, spaceName: string | undefined) =>
  collection ? `${collection} · ${spaceName || 'alt cont'}` : `Primite de la ${spaceName || 'alt cont'}`
export const folderOf = (s: Story) => s.mine === false ? receivedFolderName(s.collection, s.spaceName) : s.collection || SOURCE_FOLDER[s.source]

/** The three folders every story falls into by how it was made; they cannot be renamed or deleted. */
export const isBuiltinFolder = (name: string) => Object.values(SOURCE_FOLDER).includes(name)
export const builtinFolderOf = (s: Pick<Story, 'source'>) => SOURCE_FOLDER[s.source]

/**
 * `mine` is false for a folder another space shared; `shared` = every story in it is shared;
 * `sharedCount` = how many of its stories are shared (some but not all: partly shared).
 */
export type Folder = { name: string; items: Story[]; icon?: string; row?: StoryFolder; builtin: boolean; mine: boolean; shared: boolean; sharedCount: number }

// Folders in shelf order (collections and our own folders first, alphabetically, then the built-in ones,
// then what other spaces shared), each with its stories. `rows` adds folders even while they are empty.
export function groupFolders(stories: Story[], rows: StoryFolder[] = []): Folder[] {
  const map = new Map<string, Story[]>()
  for (const r of rows) map.set(r.name, [])
  for (const s of stories) map.set(folderOf(s), [...(map.get(folderOf(s)) ?? []), s])
  return [...map].map(([name, items]) => {
    const row = rows.find((r) => r.name === name)
    const mine = row ? row.mine !== false : items.every((s) => s.mine !== false)
    const shared = items.length ? items.every((s) => s.shared) : !!row?.shared
    const sharedCount = items.filter((s) => s.shared).length
    return { name, items, icon: row?.icon, row, builtin: mine && isBuiltinFolder(name), mine, shared, sharedCount }
  }).sort((a, b) => Number(!a.mine) - Number(!b.mine) || Number(a.builtin) - Number(b.builtin) || a.name.localeCompare(b.name, 'ro'))
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

/** Total listening time of a folder: "45 min", "2 h", "1 h 30". */
export function folderTime(items: Story[]) {
  const min = Math.round(items.reduce((t, s) => t + (s.durationSec ?? 0), 0) / 60)
  if (!min) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m && h < 10 ? `${h} h ${m}` : `${h} h`
}
