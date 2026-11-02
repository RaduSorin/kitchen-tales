// On-device storage so stories (and the recipe list) work without internet.
// Audio files are kept in IndexedDB; lists are cached after each online load.
import { openDB, type DBSchema } from 'idb'
import type { Recipe, Story } from './types'

interface OfflineDB extends DBSchema {
  audio: { key: string; value: { storyId: string; blob: Blob; savedAt: number } }
  lists: { key: 'stories' | 'recipes'; value: Story[] | Recipe[] }
  /** Story cover pictures, keyed by their S3 path. Small, so every cover seen once is kept. */
  covers: { key: string; value: Blob }
}

const dbPromise = openDB<OfflineDB>('kitchen-tales-offline', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('audio', { keyPath: 'storyId' })
      db.createObjectStore('lists')
    }
    if (oldVersion < 2) db.createObjectStore('covers')
  },
})

const listeners = new Set<() => void>()
export const onOfflineChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach((fn) => fn())

export async function saveAudio(storyId: string, blob: Blob) {
  // Ask the browser not to evict our data when the device is low on space.
  navigator.storage?.persist?.().catch(() => {})
  await (await dbPromise).put('audio', { storyId, blob, savedAt: Date.now() })
  notify()
}

export async function getAudio(storyId: string) {
  return (await (await dbPromise).get('audio', storyId))?.blob
}

export async function removeAudio(storyId: string) {
  await (await dbPromise).delete('audio', storyId)
  notify()
}

export async function offlineStoryIds() {
  return new Set(await (await dbPromise).getAllKeys('audio'))
}

export async function cacheList(name: 'stories', items: Story[]): Promise<void>
export async function cacheList(name: 'recipes', items: Recipe[]): Promise<void>
export async function cacheList(name: 'stories' | 'recipes', items: Story[] | Recipe[]) {
  await (await dbPromise).put('lists', items, name)
}

export async function cachedList(name: 'stories'): Promise<Story[] | undefined>
export async function cachedList(name: 'recipes'): Promise<Recipe[] | undefined>
export async function cachedList(name: 'stories' | 'recipes') {
  return (await dbPromise).get('lists', name)
}

export async function getCover(key: string) {
  return (await dbPromise).get('covers', key)
}

export async function saveCover(key: string, blob: Blob) {
  await (await dbPromise).put('covers', blob, key)
}

export async function removeCover(key: string) {
  await (await dbPromise).delete('covers', key)
}
