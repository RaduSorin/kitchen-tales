// Stamps (recipes) and stickers (stories): what each person has done, kept as counters, and the
// rules that turn those counters into earned badges. Pure functions only, so they are tested
// without a browser (test/badges.test.ts); src/lib/badges/store.ts keeps the state and syncs it.
import { BADGES, type Badge } from './catalog'

/** One person's progress. Counters only grow; merging two copies keeps the larger of each. */
export interface BadgeState {
  /** Counters, e.g. recipes added, meals cooked, `cook:<recipe id>` per recipe. */
  counts: Record<string, number>
  /** Sets of names, e.g. the recipe categories used, the folders listened to. */
  sets: Record<string, string[]>
  /** Earned badge id → when (ISO). */
  earned: Record<string, string>
  /** Badges already celebrated (a stamp shown, a sticker stuck in the album). */
  seen: string[]
  /** The day (YYYY-MM-DD) the last listening sticker was given: at most one an evening. */
  listenDay?: string
  /** When this person started collecting (ISO), for the one-year stamp. */
  since?: string
  /** Which start this copy belongs to: copies from an older start are dropped (see EPOCH). */
  epoch?: number
}

/**
 * Badges start fresh from this version on: nothing done before counts. Raise it to start
 * everyone over again; an older copy (on a phone or in the cloud) is then thrown away.
 */
export const EPOCH = 2

export const emptyState = (): BadgeState => ({ counts: {}, sets: {}, earned: {}, seen: [], epoch: EPOCH })

/** How a new recipe came into the app. */
export type RecipeWay = 'written' | 'link' | 'video' | 'photo' | 'dictation' | 'text' | 'ai' | 'fridge'

/** Something the person did that a badge may count. */
export type BadgeEvent =
  | { t: 'recipe-added'; way: RecipeWay; category?: string; photo: boolean }
  | { t: 'cooked'; recipeId: string }
  | { t: 'cook-opened' }
  | { t: 'cook-finished' }
  | { t: 'hands-free' }
  | { t: 'timers'; running: number }
  | { t: 'cook-note' }
  | { t: 'servings' }
  | { t: 'week-full' }
  | { t: 'shopping-done' }
  | { t: 'cookbook'; size: 'a5' | 'a4'; recipes: number }
  | { t: 'invited' }
  | { t: 'shared' }
  | { t: 'story-added'; source: 'upload' | 'recording' | 'generated' }
  | { t: 'story-cover' }
  | { t: 'folder-made' }
  | { t: 'kid-mode' }
  | { t: 'offline-saved' }
  | {
      t: 'story-finished'; storyId: string; folder: string; folders: string[]
      /** The story's length, how it was made, played from the phone's copy, in kid mode. */
      secs?: number; source?: 'upload' | 'recording' | 'generated'; offline?: boolean; kid?: boolean
    }
  | { t: 'favorite' }
  | { t: 'sleep-stop' }

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isDessert = (category?: string) => !!category && /desert|dulc/i.test(category)

const bump = (s: BadgeState, key: string, by = 1): BadgeState => ({ ...s, counts: { ...s.counts, [key]: (s.counts[key] ?? 0) + by } })
const atLeast = (s: BadgeState, key: string, n: number): BadgeState => ((s.counts[key] ?? 0) >= n ? s : { ...s, counts: { ...s.counts, [key]: n } })
const addTo = (s: BadgeState, key: string, ...values: string[]): BadgeState => {
  const cur = s.sets[key] ?? []
  const next = [...new Set([...cur, ...values.filter(Boolean)])]
  return next.length === cur.length ? s : { ...s, sets: { ...s.sets, [key]: next } }
}
const replace = (s: BadgeState, key: string, values: string[]): BadgeState => ({ ...s, sets: { ...s.sets, [key]: [...new Set(values.filter(Boolean))] } })

/** Counts what the person just did. `now` decides the evening and Sunday badges. */
export function applyEvent(s: BadgeState, e: BadgeEvent, now: Date): BadgeState {
  const hour = now.getHours()
  let x = s.since ? s : { ...s, since: now.toISOString() }
  switch (e.t) {
    case 'recipe-added':
      x = bump(bump(x, 'recipes'), `way:${e.way}`)
      if (e.category) x = addTo(x, 'categories', e.category.trim().toLowerCase())
      if (e.photo) x = bump(x, 'photos')
      if (isDessert(e.category)) x = bump(x, 'desserts')
      return x
    case 'cooked':
      x = bump(bump(x, 'cooked'), `cook:${e.recipeId}`)
      if (now.getDay() === 0 && hour < 11) x = bump(x, 'brunch')
      return x
    case 'cook-opened': return hour >= 23 || hour < 4 ? bump(x, 'night') : x
    case 'cook-finished': return bump(x, 'cookmode')
    case 'hands-free': return bump(x, 'handsfree')
    case 'timers': return atLeast(x, 'timers', e.running)
    case 'cook-note': return bump(x, 'notes')
    case 'servings': return bump(x, 'servings')
    case 'week-full': return bump(x, 'week')
    case 'shopping-done': return bump(x, 'shopping')
    case 'cookbook':
      x = bump(x, 'cookbook')
      return e.size === 'a4' && e.recipes >= 20 ? bump(x, 'print') : x
    case 'invited': return bump(x, 'invited')
    case 'shared': return bump(x, 'shared')
    case 'story-added': return bump(bump(x, 'stories'), `source:${e.source}`)
    case 'story-cover': return bump(x, 'covers')
    case 'folder-made': return bump(x, 'folders')
    case 'kid-mode': return bump(x, 'kid')
    case 'offline-saved': return bump(x, 'offline')
    case 'story-finished':
      x = bump(bump(x, 'listened'), `listen:${e.storyId}`)
      x = addTo(x, 'folders', e.folder)
      x = replace(x, 'allFolders', e.folders)
      // An evening story: after 9 pm (or past midnight).
      if (hour >= 21 || hour < 4) x = addTo(x, 'evenings', dayOf(hour < 4 ? new Date(now.getTime() - 5 * 3_600_000) : now))
      // Every day with a story (past midnight still counts as the evening before), for "evenings in a row".
      x = addTo(x, 'days', dayOf(hour < 4 ? new Date(now.getTime() - 5 * 3_600_000) : now))
      if (hour >= 4 && hour < 9) x = bump(x, 'morning')
      if (e.secs && e.secs >= 20 * 60) x = bump(x, 'long')
      if (e.secs && e.secs < 5 * 60) x = bump(x, 'short')
      if (e.source === 'recording') x = bump(x, `rec:${e.storyId}`)
      if (e.offline) x = bump(x, 'offlineListen')
      if (e.kid) x = bump(x, 'kidListen')
      if (now.getMonth() === 11 && now.getDate() >= 24 && now.getDate() <= 26) x = bump(x, 'xmas')
      if (now.getMonth() === 9 && now.getDate() === 31) x = bump(x, 'halloween')
      return x
    case 'favorite': return bump(x, 'favorite')
    case 'sleep-stop': return bump(x, 'sleepstop')
  }
}

/** The badge's progress: how much is done and how much is needed (have ≥ need: earned). */
export function progressOf(b: Badge, s: BadgeState, now: Date) {
  const [have, need] = b.goal(s, now)
  return { have: Math.min(have, need), need, done: have >= need }
}

/**
 * Gives every badge whose goal is reached. Listening stickers come at most one an evening (the
 * next waits for a story on another day).
 * Returns the new state and the badges just earned, in catalogue order.
 */
export function evaluate(s: BadgeState, now: Date): { state: BadgeState; fresh: string[] } {
  const today = dayOf(now)
  let listenDay = s.listenDay
  const earned = { ...s.earned }
  const fresh: string[] = []
  for (const b of BADGES) {
    if (earned[b.id]) continue
    if (!progressOf(b, s, now).done) continue
    if (b.listen) {
      if (listenDay === today) continue
      listenDay = today
    }
    earned[b.id] = now.toISOString()
    fresh.push(b.id)
  }
  if (!fresh.length) return { state: s, fresh }
  return { state: { ...s, earned, listenDay }, fresh }
}

/** Two copies of the same person's progress (two phones, or the phone and the cloud) as one. */
export function mergeStates(a: BadgeState, b: BadgeState): BadgeState {
  const counts = { ...a.counts }
  for (const [k, v] of Object.entries(b.counts)) counts[k] = Math.max(counts[k] ?? 0, v)
  const sets = { ...a.sets }
  for (const [k, v] of Object.entries(b.sets)) {
    // The list of every folder is a snapshot, not a collection: the newest wins (the longer one).
    sets[k] = k === 'allFolders' ? ((v.length >= (sets[k]?.length ?? 0)) ? v : sets[k]) : [...new Set([...(sets[k] ?? []), ...v])]
  }
  const earned = { ...a.earned }
  for (const [k, v] of Object.entries(b.earned)) earned[k] = earned[k] && earned[k] < v ? earned[k] : v
  const min = (x?: string, y?: string) => (!x ? y : !y ? x : x < y ? x : y)
  const max = (x?: string, y?: string) => (!x ? y : !y ? x : x > y ? x : y)
  return {
    counts, sets, earned,
    seen: [...new Set([...a.seen, ...b.seen])],
    listenDay: max(a.listenDay, b.listenDay),
    since: min(a.since, b.since),
    epoch: Math.max(a.epoch ?? 0, b.epoch ?? 0),
  }
}
