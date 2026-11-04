// Cloud storage via AWS Amplify: recipe/story records in DynamoDB, photos and audio files in S3.
// Rows belong to the signed-in account's space; shared ones are readable by every account
// (see amplify/shared/spaces.ts and lib/space.ts).
import { generateClient } from 'aws-amplify/data'
import { getUrl, remove, uploadData } from 'aws-amplify/storage'
import type { Schema } from '../../amplify/data/resource'
import type { SharedSettings } from './settings'
import type { PlanEntry, Recipe, ShoppingItem, Story, StoryFolder, StorySource } from './types'
import { cachedList, cacheList, getAudio, pruneAudio, removeAudio, removePhoto, saveAudio } from './offline'
import { kidAllowsFolder, kidFolderRenamed, kidFolderRows, kidStories } from './kidMode'
import { folderOf } from './stories'
import { isMine, isShared, mySpaceGroup, readerGroupsFor, spaceReady } from './space'

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
  mine: isMine(r.spaceGroups),
  shared: isShared(r.readerGroups),
  spaceName: r.spaceName ?? undefined,
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
  mine: isMine(s.spaceGroups),
  shared: isShared(s.readerGroups),
  spaceName: s.spaceName ?? undefined,
})

type Page<T> = { data: T[]; nextToken?: string | null; errors?: { message: string }[] }

async function listAll<T>(fetchPage: (nextToken?: string | null) => Promise<Page<T>>) {
  // The token must carry the account's groups before the first list, or nothing is visible.
  await spaceReady()
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

/** Uploads a file; `onProgress` gets the share sent so far (0 to 1), for big audio files. */
export async function uploadFile(prefix: 'recipe-photos' | 'stories' | 'story-covers', blob: Blob, fallbackExt: string, onProgress?: (share: number) => void) {
  const path = `${prefix}/${newId()}.${extFor(blob, fallbackExt)}`
  await uploadData({
    path, data: blob,
    options: {
      contentType: blob.type || undefined,
      onProgress: onProgress && (({ transferredBytes, totalBytes }) => { if (totalBytes) onProgress(transferredBytes / totalBytes) }),
    },
  }).result
  return path
}

export async function fileUrl(path: string) {
  return (await getUrl({ path, options: { expiresIn: 3600 } })).url.toString()
}

async function removeFile(path?: string) {
  if (!path) return
  await remove({ path }).catch(() => {})
  removePhoto(path).catch(() => {})
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
  const { updatedAt: _, mine: _m, shared, spaceName: _n, ...fields } = r
  const input = { ...fields, category: fields.category || null, notes: fields.notes || null, sourceUrl: fields.sourceUrl || null,
    servings: fields.servings ?? null, minutes: fields.minutes ?? null, photoKey: fields.photoKey ?? null,
    stepPhotoKeys: fields.stepPhotoKeys?.some(Boolean) ? fields.stepPhotoKeys : null }
  // A new recipe starts private to its space.
  const res = isNew
    ? await client.models.Recipe.create({ ...input, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(!!shared) })
    : await client.models.Recipe.update(input)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export async function deleteRecipe(r: Recipe) {
  const res = await client.models.Recipe.delete({ id: r.id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  await removeFile(r.photoKey)
  await Promise.all((r.stepPhotoKeys ?? []).map((k) => removeFile(k || undefined)))
}

export { removeFile }

// ---- stories ----

/** Every story, newest first (in kid mode only the folders the child may see). */
export async function listStories() {
  return kidStories(await listAllStories())
}

async function listAllStories() {
  try {
    const listedAt = Date.now()
    const rows = await listAll((nextToken) => client.models.Story.list({ nextToken, limit: 200 }))
    const list = rows.map(toStory).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    cacheList('stories', list).catch(() => {})
    // Free the space of stories deleted elsewhere; their audio would otherwise stay here forever.
    pruneAudio(new Set(list.map((s) => s.id)), listedAt).catch(() => {})
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
    const s = data ? toStory(data) : undefined
    return s && kidAllowsFolder(folderOf(s)) ? s : undefined
  } catch (err) {
    const hit = (await cachedList('stories'))?.find((s) => s.id === id)
    if (hit) return kidAllowsFolder(folderOf(hit)) ? hit : undefined
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

export async function createStory(story: Omit<Story, 'id' | 'createdAt'>) {
  const { mine: _m, shared, spaceName: _n, ...s } = story
  // A new story starts shared with every account, unless asked otherwise.
  const share = shared ?? true
  const res = await client.models.Story.create({ ...s, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(share), sharedDirect: share })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') ?? 'Eroare la salvare')
  return res.data.id
}

export async function deleteStory(s: Story) {
  const res = await client.models.Story.delete({ id: s.id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  await removeFile(s.audioKey)
  await removeFile(s.coverKey)
  await removeAudio(s.id).catch(() => {})
}

// ---- story folders ----

const FOLDERS_KEY = 'kt-story-folders'

const errorsOf = (res: { errors?: { message: string }[] | null }) => {
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

/** The family's own folders as last seen on this device (for a fast, offline-friendly first paint). */
export function cachedFolders(): StoryFolder[] {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]') } catch { return [] }
}
const cacheFolders = (list: StoryFolder[]) => { try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ } }

export async function listFolders(): Promise<StoryFolder[]> {
  try {
    const rows = await listAll((nextToken) => client.models.StoryFolder.list({ nextToken, limit: 200 }))
    const list = rows.map((r) => ({
      id: r.id, name: r.name, icon: r.icon ?? undefined,
      mine: isMine(r.spaceGroups), shared: isShared(r.readerGroups), spaceName: r.spaceName ?? undefined,
    }))
    cacheFolders(list)
    return kidFolderRows(list)
  } catch {
    return kidFolderRows(cachedFolders())
  }
}

/** Updates stories in the offline copy of the list, so the shelf is right without internet too. */
async function patchCachedStories(change: (s: Story) => Story) {
  const cached = await cachedList('stories').catch(() => undefined)
  if (cached) await cacheList('stories', cached.map(change)).catch(() => {})
}

/** Puts a story in a folder (by name), or back in its own folder by how it was made (null). */
export async function moveStory(s: Story, collection: string | null) {
  errorsOf(await client.models.Story.update({ id: s.id, collection }))
  await patchCachedStories((x) => (x.id === s.id ? { ...x, collection: collection ?? undefined } : x))
}

export async function createFolder(name: string, icon?: string) {
  // Like stories, a new folder starts shared.
  const res = await client.models.StoryFolder.create({ name, icon: icon ?? null, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(true) })
  errorsOf(res)
  if (!res.data) throw new Error('Nu am putut crea folderul.')
  cacheFolders([...cachedFolders(), { id: res.data.id, name, icon }])
  return res.data.id
}

/**
 * Renames a folder and/or changes its icon, moving its stories along. `row` is missing for a
 * folder that only existed through its stories (e.g. a bought collection); it gets one now.
 */
export async function saveFolder(oldName: string, row: StoryFolder | undefined, name: string, icon: string | undefined, stories: Story[]) {
  if (row) {
    errorsOf(await client.models.StoryFolder.update({ id: row.id, name, icon: icon ?? null }))
    cacheFolders(cachedFolders().map((f) => (f.id === row.id ? { ...f, name, icon } : f)))
  } else await createFolder(name, icon)
  if (name !== oldName) {
    kidFolderRenamed(oldName, name)
    for (const s of stories.filter((x) => x.collection === oldName)) errorsOf(await client.models.Story.update({ id: s.id, collection: name }))
    await patchCachedStories((x) => (x.collection === oldName ? { ...x, collection: name } : x))
  }
}

/** Removes a folder; its stories are kept and go back to their own folder by how they were made. */
export async function deleteFolder(name: string, row: StoryFolder | undefined, stories: Story[]) {
  kidFolderRenamed(name)
  for (const s of stories.filter((x) => x.collection === name)) errorsOf(await client.models.Story.update({ id: s.id, collection: null }))
  await patchCachedStories((x) => (x.collection === name ? { ...x, collection: undefined } : x))
  if (row) errorsOf(await client.models.StoryFolder.delete({ id: row.id }))
  cacheFolders(cachedFolders().filter((f) => f.name !== name))
}

// ---- recipe import ----

export type ImportedRecipe = NonNullable<Awaited<ReturnType<typeof client.queries.importRecipe>>['data']>

async function runImport(args: { url?: string; photoKey?: string; text?: string; idea?: string; tools?: string[]; servings?: number }) {
  const res = await client.queries.importRecipe(args)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data?.title) throw new Error('Nu am găsit o rețetă aici.')
  return res.data
}

export const importRecipeFromUrl = (url: string) => runImport({ url })

/** Lets Claude structure free text (dictated, or pasted without clear headings). */
export const importRecipeFromText = (text: string) => runImport({ text })

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

/** An account; `sameSpace` = in the signed-in account's space (sees everything there). */
export type FamilyMember = { email: string; pending: boolean; createdAt?: string | null; space?: string | null; sameSpace?: boolean | null }

export async function listFamily(): Promise<FamilyMember[]> {
  const res = await client.queries.listFamily()
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return (res.data ?? []).filter((m): m is FamilyMember => !!m)
}

/**
 * Creates the account and emails a temporary password; resend: true sends it again.
 * separate: true gives it its own space (it sees only what is shared); otherwise it joins ours.
 */
export async function inviteFamilyMember(email: string, resend = false, separate = false): Promise<FamilyMember> {
  const res = await client.mutations.inviteFamilyMember({ email, resend, separate })
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
  create: async (p: PlanEntry) => check(await client.models.MealPlanEntry.create({ ...p, servings: p.servings ?? null, spaceGroups: [await mySpaceGroup()] })),
  update: async (p: PlanEntry) => check(await client.models.MealPlanEntry.update({ ...p, servings: p.servings ?? null })),
  remove: async (id: string) => check(await client.models.MealPlanEntry.delete({ id })),
}

export const shoppingApi = {
  list: async () => (await listAll((nextToken) => client.models.ShoppingItem.list({ nextToken, limit: 500 }))).map(toShopping),
  create: async (s: ShoppingItem) => {
    const { createdAt: _, ...fields } = s
    check(await client.models.ShoppingItem.create({
      ...fields, recipeId: fields.recipeId ?? null, recipeTitle: fields.recipeTitle ?? null, spaceGroups: [await mySpaceGroup()],
    }))
  },
  update: async (s: ShoppingItem) => check(await client.models.ShoppingItem.update({ id: s.id, text: s.text, checked: s.checked })),
  remove: async (id: string) => check(await client.models.ShoppingItem.delete({ id })),
}

// ---- space settings (one row per space, id = the space group) ----

/** The space's settings from the cloud, or null if they were never saved there. */
export async function getFamilySettings(): Promise<(Omit<SharedSettings, 'city' | 'kid'> & { city?: string; kid?: SharedSettings['kid'] }) | null> {
  const res = await client.models.FamilySettings.get({ id: await mySpaceGroup() })
  check(res)
  const r = res.data
  if (!r) return null
  return {
    child: {
      name: r.childName ?? '',
      birthYear: r.childBirthYear ?? undefined,
      gender: r.childGender === 'boy' || r.childGender === 'girl' ? r.childGender : undefined,
      canRead: !!r.childCanRead,
    },
    city: r.city ?? undefined,
    kitchenTools: clean(r.kitchenTools),
    kid: r.kidMinutes == null && !r.kidPinHash ? undefined : {
      pinHash: r.kidPinHash ?? undefined,
      pinSalt: r.kidPinSalt ?? undefined,
      minutes: r.kidMinutes ?? 30,
      folders: clean(r.kidFolders),
    },
  }
}

export async function saveFamilySettings(s: SharedSettings) {
  const space = await mySpaceGroup()
  const row = {
    id: space,
    spaceGroups: [space],
    childName: s.child.name,
    childBirthYear: s.child.birthYear ?? null,
    childGender: s.child.gender ?? null,
    childCanRead: s.child.canRead,
    city: s.city ?? null,
    kitchenTools: s.kitchenTools,
    kidPinHash: s.kid.pinHash ?? null,
    kidPinSalt: s.kid.pinSalt ?? null,
    kidMinutes: s.kid.minutes,
    kidFolders: s.kid.folders,
  }
  const res = await client.models.FamilySettings.update(row)
  // Not there yet (first save): create it instead.
  if (res.errors?.length || !res.data) check(await client.models.FamilySettings.create(row))
}

// ---- cooking timer alarms (push notifications) ----

export async function scheduleTimerAlarm(args: { id: string; endsAt: string; title: string; body: string; url: string; subscription: string }) {
  const res = await client.mutations.scheduleTimerAlarm(args)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export async function cancelTimerAlarm(id: string) {
  const res = await client.mutations.cancelTimerAlarm({ id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}
