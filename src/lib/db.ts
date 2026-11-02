// Cloud storage via AWS Amplify: recipe/story records in DynamoDB,
// photos and audio files in S3. Visible to every signed-in family member.
import { generateClient } from 'aws-amplify/data'
import { getUrl, remove, uploadData } from 'aws-amplify/storage'
import type { Schema } from '../../amplify/data/resource'
import type { PlanEntry, Recipe, ShoppingItem, Story, StorySource } from './types'
import { cachedList, cacheList, getAudio, removeAudio, saveAudio } from './offline'

const client = generateClient<Schema>()

type RecipeRow = Schema['Recipe']['type']
type StoryRow = Schema['Story']['type']

const clean = (xs?: (string | null)[] | null) => (xs ?? []).filter((x): x is string => !!x)

const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id,
  title: r.title,
  category: r.category ?? '',
  servings: r.servings ?? undefined,
  minutes: r.minutes ?? undefined,
  ingredients: clean(r.ingredients),
  steps: clean(r.steps),
  stepPhotoKeys: r.stepPhotoKeys?.map((k) => k ?? '') ?? undefined,
  notes: r.notes ?? undefined,
  sourceUrl: r.sourceUrl ?? undefined,
  photoKey: r.photoKey ?? undefined,
  updatedAt: r.updatedAt,
})

const toStory = (s: StoryRow): Story => ({
  id: s.id,
  title: s.title,
  emoji: s.emoji ?? '⭐',
  coverKey: s.coverKey ?? undefined,
  collection: s.collection ?? undefined,
  source: (s.source ?? 'upload') as StorySource,
  audioKey: s.audioKey,
  durationSec: s.durationSec ?? undefined,
  text: s.text ?? undefined,
  favorite: s.favorite ?? undefined,
  createdAt: s.createdAt,
})

type Page<T> = { data: T[]; nextToken?: string | null; errors?: { message: string }[] }

async function listAll<T>(fetchPage: (nextToken?: string | null) => Promise<Page<T>>) {
  const out: T[] = []
  let token: string | null | undefined
  do {
    const page = await fetchPage(token)
    if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '))
    out.push(...page.data)
    token = page.nextToken
  } while (token)
  return out
}

export const newId = () => crypto.randomUUID()

// ---- files ----

const extFor = (blob: Blob, fallback: string) => {
  const t = blob.type.split('/')[1]?.split(';')[0]
  return t ? t.replace('mpeg', 'mp3').replace('x-m4a', 'm4a') : fallback
}

export async function uploadFile(prefix: 'recipe-photos' | 'stories' | 'story-covers', blob: Blob, fallbackExt: string) {
  const path = `${prefix}/${newId()}.${extFor(blob, fallbackExt)}`
  await uploadData({ path, data: blob, options: { contentType: blob.type || undefined } }).result
  return path
}

export async function fileUrl(path: string) {
  return (await getUrl({ path, options: { expiresIn: 3600 } })).url.toString()
}

async function removeFile(path?: string) {
  if (path) await remove({ path }).catch(() => {})
}

// ---- recipes ----

export async function listRecipes() {
  try {
    const rows = await listAll((nextToken) => client.models.Recipe.list({ nextToken, limit: 200 }))
    const list = rows.map(toRecipe).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    cacheList('recipes', list).catch(() => {})
    return list
  } catch (err) {
    const cached = await cachedList('recipes')
    if (cached) return cached
    throw err
  }
}

export async function getRecipe(id: string) {
  try {
    const { data } = await client.models.Recipe.get({ id })
    return data ? toRecipe(data) : undefined
  } catch (err) {
    const hit = (await cachedList('recipes'))?.find((r) => r.id === id)
    if (hit) return hit
    throw err
  }
}

export async function saveRecipe(r: Recipe, isNew: boolean) {
  const { updatedAt: _, ...fields } = r
  const input = { ...fields, category: fields.category || null, notes: fields.notes || null, sourceUrl: fields.sourceUrl || null,
    servings: fields.servings ?? null, minutes: fields.minutes ?? null, photoKey: fields.photoKey ?? null,
    stepPhotoKeys: fields.stepPhotoKeys?.some(Boolean) ? fields.stepPhotoKeys : null }
  const res = isNew ? await client.models.Recipe.create(input) : await client.models.Recipe.update(input)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export async function deleteRecipe(r: Recipe) {
  await client.models.Recipe.delete({ id: r.id })
  await removeFile(r.photoKey)
  await Promise.all((r.stepPhotoKeys ?? []).map((k) => removeFile(k || undefined)))
}

export { removeFile }

// ---- stories ----

export async function listStories() {
  try {
    const rows = await listAll((nextToken) => client.models.Story.list({ nextToken, limit: 200 }))
    const list = rows.map(toStory).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    cacheList('stories', list).catch(() => {})
    return list
  } catch (err) {
    const cached = await cachedList('stories')
    if (cached) return cached
    throw err
  }
}

export async function getStory(id: string) {
  try {
    const { data } = await client.models.Story.get({ id })
    return data ? toStory(data) : undefined
  } catch (err) {
    const hit = (await cachedList('stories'))?.find((s) => s.id === id)
    if (hit) return hit
    throw err
  }
}

// Downloads a story's audio to the device so it plays without internet.
export async function downloadStory(s: Story) {
  const res = await fetch(await fileUrl(s.audioKey))
  if (!res.ok) throw new Error('Descărcarea a eșuat')
  await saveAudio(s.id, await res.blob())
}

export { getAudio as getOfflineAudio, removeAudio as removeOfflineAudio }

export async function createStory(s: Omit<Story, 'id' | 'createdAt'>) {
  const res = await client.models.Story.create(s)
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') ?? 'Eroare la salvare')
  return res.data.id
}

export async function deleteStory(s: Story) {
  await client.models.Story.delete({ id: s.id })
  await removeFile(s.audioKey)
  await removeFile(s.coverKey)
  await removeAudio(s.id).catch(() => {})
}

// ---- recipe import ----

export type ImportedRecipe = NonNullable<Awaited<ReturnType<typeof client.queries.importRecipe>>['data']>

async function runImport(args: { url?: string; photoKey?: string; idea?: string; tools?: string[]; servings?: number }) {
  const res = await client.queries.importRecipe(args)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data?.title) throw new Error('Nu am găsit o rețetă aici.')
  return res.data
}

export const importRecipeFromUrl = (url: string) => runImport({ url })

export type RecipeIdea = { title: string; description?: string | null; tools?: (string | null)[] | null; missing?: (string | null)[] | null; minutes?: number | null }

/** Asks Claude for a few dishes that can be made from what is in the fridge. */
export async function suggestRecipes(ingredients: string, tools: string[]): Promise<RecipeIdea[]> {
  const res = await client.queries.suggestRecipes({ ingredients, tools })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return (res.data ?? []).filter((x): x is NonNullable<typeof x> => !!x)
}

/** Asks Claude for a new recipe from an idea, using only the given kitchen tools. */
export const generateRecipe = (idea: string, tools: string[], servings?: number) => runImport({ idea, tools, servings })

/** Draws a photo for a recipe with AI and returns its storage path. */
export async function generateRecipePhoto(title: string, ingredients: string[]): Promise<string> {
  const res = await client.mutations.generateRecipePhoto({ title, ingredients })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data) throw new Error('Nu am putut genera poza.')
  return res.data
}

export async function importRecipeFromPhoto(photo: Blob) {
  const photoKey = await uploadFile('recipe-photos', photo, 'jpg')
  try {
    return await runImport({ photoKey })
  } finally {
    await removeFile(photoKey)
  }
}

// ---- story generation ----

export type StoryBrief = {
  prompt?: string
  childName?: string
  gender?: 'boy' | 'girl'
  age?: number
  length?: 'short' | 'medium' | 'long'
}

export async function generateStory(args: { title: string; text?: string } & StoryBrief) {
  const res = await client.queries.generateStory(args)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data) throw new Error('Nu am putut crea povestea.')
  return res.data
}

// ---- story covers ----

export type CoverCandidate = { url: string; source: string; label?: string | null }

/** Covers from the iTunes catalog and Wikipedia that match a story's title. */
export async function findCovers(title: string, artist?: string): Promise<CoverCandidate[]> {
  const res = await client.queries.findCovers({ title, artist })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return (res.data ?? []).filter((c): c is CoverCandidate => !!c?.url)
}

/** Copies a found cover into our storage; returns its path. */
export async function saveFoundCover(url: string) {
  const res = await client.mutations.saveCover({ url })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') ?? 'Nu am putut salva coperta.')
  return res.data
}

/** Marks or unmarks a favourite story; also updates the offline copy of the list. */
export async function setStoryFavorite(s: Story, favorite: boolean) {
  const res = await client.models.Story.update({ id: s.id, favorite })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  const cached = await cachedList('stories').catch(() => undefined)
  if (cached) await cacheList('stories', cached.map((x) => (x.id === s.id ? { ...x, favorite } : x))).catch(() => {})
}

export async function setStoryCover(s: Story, coverKey: string) {
  const res = await client.models.Story.update({ id: s.id, coverKey })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (s.coverKey && s.coverKey !== coverKey) await removeFile(s.coverKey)
}

// ---- family accounts ----

export type FamilyMember = { email: string; pending: boolean; createdAt?: string | null }

export async function listFamily(): Promise<FamilyMember[]> {
  const res = await client.queries.listFamily()
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return (res.data ?? []).filter((m): m is FamilyMember => !!m)
}

/** Creates the account and emails a temporary password; resend: true sends it again. */
export async function inviteFamilyMember(email: string, resend = false): Promise<FamilyMember> {
  const res = await client.mutations.inviteFamilyMember({ email, resend })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data) throw new Error('Nu am putut trimite invitația.')
  return res.data
}

// ---- meal plan ("Săptămâna mea") and shopping list ----

type PlanRow = Schema['MealPlanEntry']['type']
type ShoppingRow = Schema['ShoppingItem']['type']

const check = (res: { errors?: { message: string }[] | null }) => {
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

const toPlan = (p: PlanRow): PlanEntry => ({ id: p.id, day: p.day, recipeId: p.recipeId, servings: p.servings ?? undefined })
const toShopping = (s: ShoppingRow): ShoppingItem => ({
  id: s.id, text: s.text, checked: !!s.checked, recipeId: s.recipeId ?? undefined, recipeTitle: s.recipeTitle ?? undefined, createdAt: s.createdAt,
})

export const planApi = {
  list: async () => (await listAll((nextToken) => client.models.MealPlanEntry.list({ nextToken, limit: 500 }))).map(toPlan),
  create: async (p: PlanEntry) => check(await client.models.MealPlanEntry.create({ ...p, servings: p.servings ?? null })),
  update: async (p: PlanEntry) => check(await client.models.MealPlanEntry.update({ ...p, servings: p.servings ?? null })),
  remove: async (id: string) => check(await client.models.MealPlanEntry.delete({ id })),
}

export const shoppingApi = {
  list: async () => (await listAll((nextToken) => client.models.ShoppingItem.list({ nextToken, limit: 500 }))).map(toShopping),
  create: async (s: ShoppingItem) => {
    const { createdAt: _, ...fields } = s
    check(await client.models.ShoppingItem.create({ ...fields, recipeId: fields.recipeId ?? null, recipeTitle: fields.recipeTitle ?? null }))
  },
  update: async (s: ShoppingItem) => check(await client.models.ShoppingItem.update({ id: s.id, text: s.text, checked: s.checked })),
  remove: async (id: string) => check(await client.models.ShoppingItem.delete({ id })),
}
