/**
 * "Urmează": the stories the family chose to hear next, in their order. They play before the
 * folder goes on by itself. The list is this device's only (localStorage) and stays after the page
 * is closed. The rules are the same as the iOS app's (ios/KitchenTales/Stories/UpNext.swift).
 */
export interface QueuedStory { id: string; byKid?: boolean }

/** In kid mode the child may choose this many stories ahead (so it is not "one more" forever). */
export const KID_LIMIT = 3
const KEY = 'kt-up-next'

export const kidCount = (q: QueuedStory[]) => q.filter((x) => x.byKid).length
export const kidHasRoom = (q: QueuedStory[]) => kidCount(q) < KID_LIMIT
/** 1 for the first story to come, undefined when the story is not in the list. */
export const placeOf = (q: QueuedStory[], id: string) => { const i = q.findIndex((x) => x.id === id); return i < 0 ? undefined : i + 1 }

/** "Redă următoarea": right after the story playing now. A story already in the list moves up. */
export function playNext(q: QueuedStory[], id: string, byKid = false): QueuedStory[] {
  const kept = q.find((x) => x.id === id)
  return [{ id, byKid: kept?.byKid ?? byKid }, ...q.filter((x) => x.id !== id)]
}

/** "Adaugă la coadă": at the end. Unchanged when it was already there or the child has no room left. */
export function addLast(q: QueuedStory[], id: string, byKid = false): QueuedStory[] {
  if (q.some((x) => x.id === id) || (byKid && !kidHasRoom(q))) return q
  return [...q, { id, byKid }]
}

export const removeFrom = (q: QueuedStory[], id: string) => q.filter((x) => x.id !== id)

/** Moves the story at `from` so it ends up at index `to`. */
export function moveTo(q: QueuedStory[], from: number, to: number): QueuedStory[] {
  if (from < 0 || from >= q.length) return q
  const out = [...q]
  const [item] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item)
  return out
}

/** With "După N povești" and `played` stories already finished in this run: how many of the stories
 * still to come play before the player stops by itself (the moon goes there). */
export const untilStop = (stopAfter: number, played: number) => Math.max(0, stopAfter - played - 1)

export type QueueResult = 'first' | 'added' | 'alreadyThere' | 'playingNow' | 'kidFull'

/** The short message after adding a story. */
export function queueMessage(r: QueueResult, playing: boolean): string {
  switch (r) {
    case 'first': return playing ? 'Urmează după povestea asta' : 'Prima în coadă. O găsești pe Acasă.'
    case 'added': return playing ? 'Adăugată la coadă' : 'Adăugată la coadă. O găsești pe Acasă.'
    case 'alreadyThere': return 'E deja în coadă'
    case 'playingNow': return 'Se ascultă acum'
    case 'kidFull': return `Ai ales deja ${KID_LIMIT} povești`
  }
}

export function loadQueue(): QueuedStory[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string') : []
  } catch { return [] }
}

export function saveQueue(q: QueuedStory[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* storage unavailable */ }
}
