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
  /** When the person's history was counted the first time (ISO). */
  seeded?: string
  /** The person's first recipe or story (ISO), for the one-year stamp. */
  since?: string
}

export const emptyState = (): BadgeState => ({ counts: {}, sets: {}, earned: {}, seen: [] })

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
  | { t: 'story-finished'; storyId: string; folder: string; folders: string[] }
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
      return x
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
 * next waits for a story on another day), except when the history is counted the first time.
 * Returns the new state and the badges just earned, in catalogue order.
 */
export function evaluate(s: BadgeState, now: Date, opts: { history?: boolean } = {}): { state: BadgeState; fresh: string[] } {
  const today = dayOf(now)
  let listenDay = s.listenDay
  const earned = { ...s.earned }
  const fresh: string[] = []
  for (const b of BADGES) {
    if (earned[b.id]) continue
    if (!progressOf(b, s, now).done) continue
    if (b.listen && !opts.history) {
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
    seeded: min(a.seeded, b.seeded),
    since: min(a.since, b.since),
  }
}

/** What the app already knows, for counting the person's history the first time. */
export interface History {
  recipes: { category?: string; sourceUrl?: string; photoKey?: string; shared?: boolean; mine?: boolean; createdAt?: string }[]
  logs: { recipeId: string; cooked: string[]; notes: unknown[] }[]
  /** Planned days (YYYY-MM-DD). */
  planDays: string[]
  stories: { source: 'upload' | 'recording' | 'generated'; coverKey?: string; mine?: boolean; createdAt?: string }[]
  /** The family's own folders. */
  folders: number
  kidMode: boolean
  /** Stories saved on this phone for offline listening. */
  offline: number
  /** Stories started on this phone (the app never counted finished ones before badges). */
  played: number
  isVideo: (url: string) => boolean
}

const mondayKey = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return dayOf(date)
}

/** The counters for what the person (and their household) did before badges existed. */
export function historyState(h: History, now: Date): BadgeState {
  let s = emptyState()
  const recipes = h.recipes.filter((r) => r.mine !== false)
  s = atLeast(s, 'recipes', recipes.length)
  const links = recipes.filter((r) => r.sourceUrl)
  s = atLeast(s, 'way:video', links.filter((r) => h.isVideo(r.sourceUrl!)).length)
  s = atLeast(s, 'way:link', links.filter((r) => !h.isVideo(r.sourceUrl!)).length)
  s = addTo(s, 'categories', ...recipes.map((r) => r.category?.trim().toLowerCase() ?? ''))
  s = atLeast(s, 'photos', recipes.filter((r) => r.photoKey).length)
  s = atLeast(s, 'desserts', recipes.filter((r) => isDessert(r.category)).length)
  if (recipes.some((r) => r.shared)) s = atLeast(s, 'shared', 1)
  s = atLeast(s, 'cooked', h.logs.reduce((n, l) => n + l.cooked.length, 0))
  for (const l of h.logs) if (l.cooked.length) s = atLeast(s, `cook:${l.recipeId}`, (s.counts[`cook:${l.recipeId}`] ?? 0) + l.cooked.length)
  s = atLeast(s, 'notes', h.logs.reduce((n, l) => n + l.notes.length, 0))
  const weeks = new Map<string, Set<string>>()
  for (const d of h.planDays) { const k = mondayKey(d); weeks.set(k, (weeks.get(k) ?? new Set()).add(d)) }
  if ([...weeks.values()].some((days) => days.size >= 7)) s = atLeast(s, 'week', 1)
  const stories = h.stories.filter((x) => x.mine !== false)
  s = atLeast(s, 'stories', stories.length)
  for (const src of ['upload', 'recording', 'generated'] as const) s = atLeast(s, `source:${src}`, stories.filter((x) => x.source === src).length)
  s = atLeast(s, 'covers', stories.filter((x) => x.coverKey).length)
  s = atLeast(s, 'folders', h.folders)
  if (h.kidMode) s = atLeast(s, 'kid', 1)
  s = atLeast(s, 'offline', h.offline)
  s = atLeast(s, 'listened', h.played)
  const first = [...recipes, ...stories].map((x) => x.createdAt).filter((x): x is string => !!x).sort()[0]
  return { ...s, since: first, seeded: now.toISOString() }
}
