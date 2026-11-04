// Cloud storage via AWS Amplify: recipe/story records in DynamoDB, photos and audio files in S3
// (reached only through the files function, which checks the space; see amplify/functions/files).
// Rows belong to the signed-in account's space; shared ones are readable by every account
// (see amplify/shared/spaces.ts and lib/space.ts).
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../amplify/data/resource'
import type { SharedSettings } from './settings'
import type { PlanEntry, Recipe, ShoppingItem, Story, StoryFolder, StorySource } from './types'
import { cachedList, cacheList, getAudio, pruneAudio, removeAudio, removePhoto, saveAudio } from './offline'
import { kidAllowsFolder, kidFolderRenamed, kidFolderRows, kidStories } from './kidMode'
import { folderOf, receivedFolderName, type Folder } from './stories'
import { isMine, isShared, mySpaceGroup, mySpaceName, readerGroupsFor, rememberSpaceName, spaceReady } from './space'

const client = generateClient<Schema>()

type RecipeRow = Schema['Recipe']['type']
type StoryRow = Schema['Story']['type']

const clean = (xs?: (string | null)[] | null) => (xs ?? []).filter((x): x is string => !!x)

const toRecipe = (r: RecipeRow): Recipe => (fileOwner(`Recipe:${r.id}`, r.photoKey, ...(r.stepPhotoKeys ?? [])), {
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

const toStory = (s: StoryRow): Story => (fileOwner(`Story:${s.id}`, s.audioKey, s.coverKey), {
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

type GqlError = { message: string; path?: readonly (string | number)[] }
type Page<T> = { data: T[]; nextToken?: string | null; errors?: GqlError[] }

// Another space's rows come without their space group (the server hides it, see data/resource.ts),
// which shows up as an error per row; the rows themselves are fine.
const hiddenSpace = (e: GqlError) => (e as { errorType?: string }).errorType === 'Unauthorized' && e.path?.[e.path.length - 1] === 'spaceGroups'

async function listAll<T>(fetchPage: (nextToken?: string | null) => Promise<Page<T>>) {
  // The token must carry the account's groups before the first list, or nothing is visible.
  await spaceReady()
  const out: T[] = []
  let token: string | null | undefined
  do {
    const page = await fetchPage(token)
    const errors = page.errors?.filter((e) => !hiddenSpace(e))
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
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

// Which row points at each file ("Story:<id>", "Recipe:<id>"): the files function needs it to let
// another space read a shared file, and for files stored before spaces had their own folders.
const owners = new Map<string, string>()
function fileOwner(ref: string, ...paths: (string | null | undefined)[]) {
  for (const p of paths) if (p) owners.set(p, ref)
}
let ownersFromCache: Promise<void> | undefined
/** Rows known only from this device's copy (offline start): learn their files once. */
const learnCachedOwners = () => (ownersFromCache ??= (async () => {
  const [stories, recipes] = await Promise.all([cachedList('stories').catch(() => undefined), cachedList('recipes').catch(() => undefined)])
  for (const s of stories ?? []) if (!owners.has(s.audioKey)) fileOwner(`Story:${s.id}`, s.audioKey, s.coverKey)
  for (const r of recipes ?? []) fileOwner(`Recipe:${r.id}`, r.photoKey, ...(r.stepPhotoKeys ?? []))
})())

/** Uploads a file into our space's folder; `onProgress` gets the share sent so far (0 to 1), for big audio files. */
export async function uploadFile(prefix: 'recipe-photos' | 'stories' | 'story-covers', blob: Blob, fallbackExt: string, onProgress?: (share: number) => void) {
  const res = await client.mutations.uploadUrl({ prefix, ext: extFor(blob, fallbackExt), contentType: blob.type || null })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Nu am putut încărca fișierul.')
  const { path, url } = res.data
  await new Promise<void>((resolve, reject) => {
    // XMLHttpRequest rather than fetch: it reports upload progress.
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (blob.type) xhr.setRequestHeader('Content-Type', blob.type)
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total) onProgress(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Încărcarea a eșuat (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('Încărcarea a eșuat'))
    xhr.send(blob)
  })
  return path
}

// Links are asked for in small batches: a shelf of covers is one call, not fifty.
type Ask = { path: string; resolve: (url: string) => void; reject: (err: unknown) => void }
let asks: Ask[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
async function flushAsks() {
  flushTimer = undefined
  const batch = asks.splice(0, 100)
  if (asks.length) flushTimer = setTimeout(flushAsks, 0)
  try {
    if (batch.some((a) => !owners.has(a.path))) await learnCachedOwners()
    const paths = [...new Set(batch.map((a) => a.path))]
    const res = await client.queries.fileUrls({ paths, refs: paths.map((p) => owners.get(p) ?? null) })
    if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Nu am putut deschide fișierul.')
    const urls = new Map(paths.map((p, i) => [p, res.data?.[i] ?? '']))
    for (const a of batch) {
      const url = urls.get(a.path)
      if (url) a.resolve(url)
      else a.reject(new Error('Fișierul nu e disponibil pentru acest cont.'))
    }
  } catch (err) {
    batch.forEach((a) => a.reject(err))
  }
}

/** A signed link (valid one hour) to read a stored file. */
export function fileUrl(path: string) {
  return new Promise<string>((resolve, reject) => {
    asks.push({ path, resolve, reject })
    flushTimer ??= setTimeout(flushAsks, 10)
  })
}

async function removeFile(path?: string) {
  if (!path) return
  await client.mutations.deleteFiles({ paths: [path], refs: [owners.get(path) ?? null] }).catch(() => {})
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
    ? await client.models.Recipe.create({ ...input, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(!!shared), spaceName: mySpaceName() })
    : await client.models.Recipe.update(input)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export async function deleteRecipe(r: Recipe) {
  // Files first: an older file may only be deleted through the row that still points at it.
  await removeFile(r.photoKey)
  await Promise.all((r.stepPhotoKeys ?? []).map((k) => removeFile(k || undefined)))
  const res = await client.models.Recipe.delete({ id: r.id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export { removeFile }

/** Shares a recipe with every account, or makes it private to our space again. */
export async function setRecipeShared(r: Recipe, shared: boolean) {
  errorsOf(await client.models.Recipe.update({ id: r.id, readerGroups: readerGroupsFor(shared), spaceName: mySpaceName() }))
  const cached = await cachedList('recipes').catch(() => undefined)
  if (cached) await cacheList('recipes', cached.map((x) => (x.id === r.id ? { ...x, shared } : x))).catch(() => {})
}

// ---- stories ----

/** Every story, newest first (in kid mode only the folders the child may see). */
export async function listStories() {
  return kidStories(await listAllStories())
}

async function listAllStories() {
  try {
    const listedAt = Date.now()
    const [rows, favs] = await Promise.all([
      listAll((nextToken) => client.models.Story.list({ nextToken, limit: 200 })),
      listAll((nextToken) => client.models.StoryFavorite.list({ nextToken, limit: 500 })),
    ])
    // Stories another space shared: our favourites of them are kept in our own space.
    const favIds = new Set(favs.map((f) => f.storyId))
    const list = rows.map(toStory).map((s) => (s.mine ? s : { ...s, favorite: favIds.has(s.id) })).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
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
    let s = data ? toStory(data) : undefined
    if (s && !s.mine) s = { ...s, favorite: !!(await client.models.StoryFavorite.get({ id: `${await mySpaceGroup()}:${s.id}` })).data }
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
  // A new story starts shared with every account, unless asked otherwise or its folder is private.
  const folder = s.collection ? cachedFolders().find((f) => f.mine !== false && f.name === s.collection) : undefined
  const share = shared ?? folder?.shared ?? true
  const res = await client.models.Story.create({
    ...s, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(share), sharedDirect: share, spaceName: mySpaceName(),
  })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') ?? 'Eroare la salvare')
  return res.data.id
}

export async function deleteStory(s: Story) {
  // Files first: an older file may only be deleted through the row that still points at it.
  await removeFile(s.audioKey)
  await removeFile(s.coverKey)
  const res = await client.models.Story.delete({ id: s.id })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
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
    // Another space's folder is shown under a name of its own (see receivedFolderName).
    const list = rows.map((r) => {
      const mine = isMine(r.spaceGroups)
      return {
        id: r.id, name: mine ? r.name : receivedFolderName(r.name, r.spaceName ?? undefined), icon: r.icon ?? undefined,
        mine, shared: isShared(r.readerGroups), spaceName: r.spaceName ?? undefined,
      }
    })
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

/**
 * Puts a story in a folder (by name), or back in its own folder by how it was made (null).
 * A story moved into one of our folders takes that folder's sharing.
 */
export async function moveStory(s: Story, collection: string | null) {
  const folder = collection ? cachedFolders().find((f) => f.mine !== false && f.name === collection) : undefined
  const shared = folder?.shared ?? s.shared
  errorsOf(await client.models.Story.update({
    id: s.id, collection, ...(folder ? { readerGroups: readerGroupsFor(!!shared), sharedDirect: !!shared, spaceName: mySpaceName() } : {}),
  }))
  await patchCachedStories((x) => (x.id === s.id ? { ...x, collection: collection ?? undefined, shared } : x))
  return { shared }
}

/** Shares one story with every account, or makes it private to our space again. */
export async function setStoryShared(s: Story, shared: boolean) {
  errorsOf(await client.models.Story.update({ id: s.id, readerGroups: readerGroupsFor(shared), sharedDirect: shared, spaceName: mySpaceName() }))
  await patchCachedStories((x) => (x.id === s.id ? { ...x, shared } : x))
}

/** Shares a whole folder (and every story in it) with every account, or makes it all private. */
export async function setFolderShared(folder: Folder, shared: boolean) {
  const readerGroups = readerGroupsFor(shared)
  const spaceName = mySpaceName()
  const ids = new Set(folder.items.filter((s) => s.mine !== false).map((s) => s.id))
  await Promise.all([...ids].map(async (id) => errorsOf(await client.models.Story.update({ id, readerGroups, sharedDirect: shared, spaceName }))))
  if (folder.row) {
    errorsOf(await client.models.StoryFolder.update({ id: folder.row.id, readerGroups, spaceName }))
    cacheFolders(cachedFolders().map((f) => (f.id === folder.row!.id ? { ...f, shared } : f)))
  } else if (!folder.builtin) {
    // A folder that only existed through its stories (a bought collection) gets a row, so it keeps its sharing.
    const res = await client.models.StoryFolder.create({ name: folder.name, spaceGroups: [await mySpaceGroup()], readerGroups, spaceName })
    errorsOf(res)
    if (res.data) cacheFolders([...cachedFolders(), { id: res.data.id, name: folder.name, mine: true, shared }])
  }
  await patchCachedStories((x) => (ids.has(x.id) ? { ...x, shared } : x))
}

export async function createFolder(name: string, icon?: string) {
  // Like stories, a new folder starts shared.
  const res = await client.models.StoryFolder.create({
    name, icon: icon ?? null, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(true), spaceName: mySpaceName(),
  })
  errorsOf(res)
  if (!res.data) throw new Error('Nu am putut crea folderul.')
  cacheFolders([...cachedFolders(), { id: res.data.id, name, icon, mine: true, shared: true }])
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

/**
 * Marks or unmarks a favourite story; also updates the offline copy of the list. A story another
 * space shared is marked in our own space (StoryFavorite), since we cannot change their row.
 */
export async function setStoryFavorite(s: Story, favorite: boolean) {
  if (s.mine === false) {
    const space = await mySpaceGroup()
    const id = `${space}:${s.id}`
    if (favorite) {
      const res = await client.models.StoryFavorite.create({ id, storyId: s.id, spaceGroups: [space] })
      // Already there (marked on another device) is fine.
      if (res.errors?.length && !res.errors.some((e) => /conditional/i.test(e.message))) errorsOf(res)
    } else errorsOf(await client.models.StoryFavorite.delete({ id }))
  } else {
    const res = await client.models.Story.update({ id: s.id, favorite })
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  }
  const cached = await cachedList('stories').catch(() => undefined)
  if (cached) await cacheList('stories', cached.map((x) => (x.id === s.id ? { ...x, favorite } : x))).catch(() => {})
}

export async function setStoryCover(s: Story, coverKey: string) {
  const old = s.coverKey && s.coverKey !== coverKey ? s.coverKey : undefined
  if (old) owners.set(old, `Story:${s.id}`)
  const res = await client.models.Story.update({ id: s.id, coverKey })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  fileOwner(`Story:${s.id}`, coverKey)
  if (old) await removeFile(old)
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
  rememberSpaceName(r.spaceName)
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
    spaceName: mySpaceName(),
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
