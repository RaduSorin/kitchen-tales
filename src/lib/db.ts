// Local-first storage (IndexedDB). Works offline on phone/tablet.
// Cloud sync (AWS Amplify) will plug in behind these same functions.
import { openDB, type DBSchema } from 'idb'
import type { Recipe, Story } from './types'

interface KTDB extends DBSchema {
  recipes: { key: string; value: Recipe; indexes: { updatedAt: number } }
  stories: { key: string; value: Story; indexes: { createdAt: number } }
}

const dbPromise = openDB<KTDB>('kitchen-tales', 1, {
  upgrade(db) {
    db.createObjectStore('recipes', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    db.createObjectStore('stories', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
  },
})

export const newId = () => crypto.randomUUID()

export async function listRecipes() {
  return (await (await dbPromise).getAllFromIndex('recipes', 'updatedAt')).reverse()
}
export async function getRecipe(id: string) {
  return (await dbPromise).get('recipes', id)
}
export async function saveRecipe(r: Recipe) {
  await (await dbPromise).put('recipes', { ...r, updatedAt: Date.now() })
}
export async function deleteRecipe(id: string) {
  await (await dbPromise).delete('recipes', id)
}

export async function listStories() {
  return (await (await dbPromise).getAllFromIndex('stories', 'createdAt')).reverse()
}
export async function getStory(id: string) {
  return (await dbPromise).get('stories', id)
}
export async function saveStory(s: Story) {
  await (await dbPromise).put('stories', s)
}
export async function deleteStory(id: string) {
  await (await dbPromise).delete('stories', id)
}
