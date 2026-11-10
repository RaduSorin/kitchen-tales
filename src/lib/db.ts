// Cloud storage via AWS Amplify: recipe/story records in DynamoDB, photos and audio files in S3
// (reached only through the files function, which checks the space; see amplify/functions/files).
// Rows belong to the signed-in account's space; shared ones are readable by every account
// (see amplify/shared/spaces.ts and lib/space.ts).
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../amplify/data/resource'
import type { SharedSettings } from './settings'
import { parseAllergens, parseDiet, parseNutrition } from './diet'
import type { PlanEntry, Recipe, RecipeLog, ShoppingItem, Story, StoryFolder, StorySource } from './types'
import { cachedList, cacheList, getAudio, pruneAudio, removeAudio, removePhoto, saveAudio } from './offline'
import { kidAllowsFolder, kidFolderRenamed, kidFolderRows, kidStories } from './kidMode'
import { folderOf, receivedFolderName, type Folder } from './stories'
import { isMine, isShared, mySpaceGroup, mySpaceName, readerGroupsFor, rememberSpaceName, setMySpaceName, spaceReady } from './space'
import { getSettings } from './settings'
import { track } from './badges/store'
import { jobPath, type JobOutcome } from '../../amplify/shared/jobs'
import { fileSpace } from '../../amplify/shared/files'

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
  nutrition: parseNutrition(r.nutrition),
  allergens: parseAllergens(r.allergens),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  mine: isMine(r.spaceGroups),
  shared: isShared(r.readerGroups),
  spaceName: r.spaceName ?? undefined,
})

const toStory = (s: StoryRow): Story => (fileOwner(`Story:${s.id}`, s.audioKey, s.coverKey), {
  id: s.id,
  title: s.title,
  emoji: s.emoji ?? '⭐',
  scene: s.scene ?? undefined,
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

// ---- lists: this device's copy first, the server's when it answers ----

/** How long a list waits for the server before it settles for this device's copy. */
const SLOW_MS = 5000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * One list kept on the server and copied on this device (recipes, stories). A weak signal must
 * not leave a page on "loading" while the copy is right here: the copy shows first, and the
 * server's list replaces it when (and if) it comes.
 */
function feed<T extends { id: string }>(name: 'recipes' | 'stories', fetchFresh: () => Promise<T[]>) {
  const cached = () => cachedList(name as 'recipes').catch(() => undefined) as Promise<T[] | undefined>
  // Each page watching: `fresh` for the server's list, `copy` for this device's.
  const watchers = new Set<{ fresh: (list: T[]) => void; copy: (list: T[]) => void }>()
  let running: Promise<T[]> | undefined
  // Bumped by every change made on this device: a request that started before the change may
  // answer with the list as it was, so its answer is not shown or kept.
  let generation = 0
  // One request at a time; every page watching gets its answer.
  const fresh = (): Promise<T[]> => {
    if (running) return running
    const asked = generation
    const req: Promise<T[]> = fetchFresh().then(async (list) => {
      if (asked !== generation) return (await cached()) ?? list
      cacheList(name as 'recipes', list as never).catch(() => {})
      watchers.forEach((w) => w.fresh(list))
      return list
    }).finally(() => { if (running === req) running = undefined })
    return (running = req)
  }
  // A fresh sign-in reads its space at once (and drops another account's copy); only a token
  // renewal waits on the network, and then the copy here is this account's own.
  const deviceCopy = async () => { await Promise.race([spaceReady(), sleep(1500)]); return cached() }

  async function list(): Promise<T[]> {
    const req = fresh()
    const slow = await Promise.race([req.then(() => false, () => false), sleep(SLOW_MS).then(() => true)])
    if (!slow) {
      try { return await req } catch (err) { const c = await cached(); if (c) return c; throw err }
    }
    // Still waiting: the copy here now; the request goes on and updates it (and any page watching).
    req.catch(() => {})
    return (await cached()) ?? req
  }

  function watch(onList: (list: T[]) => void, onError?: (err: unknown) => void) {
    let live = true
    let gotFresh = false
    const w = { fresh: (l: T[]) => { if (live) { gotFresh = true; onList(l) } }, copy: (l: T[]) => { if (live) onList(l) } }
    watchers.add(w)
    deviceCopy().then((c) => { if (live && !gotFresh && c) onList(c) })
    const ask = () => fresh().catch(async (err) => {
      if (!live || gotFresh) return
      if (!(await cached())) onError?.(err)
    })
    ask()
    // The signal came back: ask again, so a list from the copy turns into the server's.
    const online = () => { if (!gotFresh) ask() }
    window.addEventListener('online', online)
    return () => { live = false; watchers.delete(w); window.removeEventListener('online', online) }
  }

  /**
   * A change saved on this device (a new, edited or deleted item): the copy here takes it at
   * once, so the next page shows it before the server answers. The list is asked again when a
   * request was already on its way (its answer no longer counts), or always with `ask`.
   */
  async function changed(apply: (list: T[]) => T[], ask = true) {
    const wasRunning = !!running
    generation++
    running = undefined
    const c = await cached()
    if (c) {
      const next = apply(c)
      await cacheList(name as 'recipes', next as never).catch(() => {})
      watchers.forEach((w) => w.copy(next))
    }
    if (watchers.size && (ask || wasRunning)) fresh().catch(() => {})
  }

  return { list, watch, changed }
}

/** `item` in place of the one with its id, or first in the list when it is new. */
const upsert = <T extends { id: string }>(item: T) => (list: T[]) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]
const without = (id: string) => <T extends { id: string }>(list: T[]) => list.filter((x) => x.id !== id)


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

/** The recipes from the server, newest change first; the device's copy is updated with them. */
async function fetchRecipes() {
  const rows = await listAll((nextToken) => client.models.Recipe.list({ nextToken, limit: 200 }))
  return rows.map(toRecipe).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
const recipesFeed = feed('recipes', fetchRecipes)

/**
 * Every recipe: the server's list, or this device's copy when the server does not answer
 * (no internet, or a weak signal that has not answered in a few seconds).
 */
export const listRecipes = () => recipesFeed.list()

/**
 * Shows the recipes right away from this device's copy, then the server's list once it answers
 * (and again whenever a newer list arrives). `onError` only when neither is there. Returns the
 * function that stops watching.
 */
export const watchRecipes = (onList: (list: Recipe[]) => void, onError?: (err: unknown) => void) => recipesFeed.watch(onList, onError)

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
  const { updatedAt: _, createdAt: _c, mine: _m, shared, spaceName: _n, ...fields } = r
  const input = { ...fields, category: fields.category || null, notes: fields.notes || null, sourceUrl: fields.sourceUrl || null,
    servings: fields.servings ?? null, minutes: fields.minutes ?? null, photoKey: fields.photoKey ?? null,
    stepPhotoKeys: fields.stepPhotoKeys?.some(Boolean) ? fields.stepPhotoKeys : null,
    nutrition: fields.nutrition ? JSON.stringify(fields.nutrition) : null, allergens: fields.allergens ? JSON.stringify(fields.allergens) : null }
  // A new recipe starts private to its space.
  const res = isNew
    ? await client.models.Recipe.create({ ...input, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(!!shared), spaceName: mySpaceName() })
    : await client.models.Recipe.update(input)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (res.data) await recipesFeed.changed(upsert(toRecipe(res.data)))
}

/** Estimates a recipe's values per serving and allergens (AI), from its ingredients. */
export async function analyzeRecipe(r: Pick<Recipe, 'title' | 'servings' | 'ingredients'>) {
  const res = await client.queries.analyzeRecipe({ title: r.title, servings: r.servings ?? null, ingredients: r.ingredients })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  const nutrition = parseNutrition(res.data?.nutrition)
  if (!nutrition) throw new Error('Nu am putut calcula valorile.')
  return { nutrition, allergens: parseAllergens(res.data?.allergens) ?? [] }
}

/** Keeps the worked-out values and allergens on our own recipe (and its cached copy). */
export async function setRecipeFacts(r: Recipe, facts: Pick<Recipe, 'nutrition' | 'allergens'>) {
  errorsOf(await client.models.Recipe.update({ id: r.id, nutrition: JSON.stringify(facts.nutrition), allergens: JSON.stringify(facts.allergens ?? []) }))
  await recipesFeed.changed((list) => list.map((x) => (x.id === r.id ? { ...x, ...facts } : x)), false)
}

/**
 * Deletes a row and its files. Files from before spaces had folders can only be deleted through
 * the row that points at them, so they go first; files in our space folder go after the row,
 * so a row that could not be deleted never loses its photo or audio.
 */
async function deleteWithFiles(files: (string | undefined)[], deleteRow: () => Promise<{ errors?: { message: string }[] | null }>) {
  const paths = files.filter((p): p is string => !!p)
  await Promise.all(paths.filter((p) => !fileSpace(p)).map((p) => removeFile(p)))
  errorsOf(await deleteRow())
  await Promise.all(paths.filter((p) => fileSpace(p)).map((p) => removeFile(p)))
}

export async function deleteRecipe(r: Recipe) {
  await deleteWithFiles([r.photoKey, ...(r.stepPhotoKeys ?? [])], () => client.models.Recipe.delete({ id: r.id }))
  await recipesFeed.changed(without(r.id))
}

export { removeFile }

/** Shares a recipe with every account, or makes it private to our space again. */
export async function setRecipeShared(r: Recipe, shared: boolean) {
  errorsOf(await client.models.Recipe.update({ id: r.id, readerGroups: readerGroupsFor(shared), spaceName: mySpaceName() }))
  await recipesFeed.changed((list) => list.map((x) => (x.id === r.id ? { ...x, shared } : x)), false)
  if (shared) track({ t: 'shared' })
}

// ---- stories ----

/** Every story from the server, newest first; the device's copy is updated with them. */
async function fetchStories() {
  const listedAt = Date.now()
  const [rows, favs] = await Promise.all([
    listAll((nextToken) => client.models.Story.list({ nextToken, limit: 200 })),
    listAll((nextToken) => client.models.StoryFavorite.list({ nextToken, limit: 500 })),
  ])
  // Stories another space shared: our favourites of them are kept in our own space.
  const favIds = new Set(favs.map((f) => f.storyId))
  const list = rows.map(toStory).map((s) => (s.mine ? s : { ...s, favorite: favIds.has(s.id) })).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  // Free the space of stories deleted elsewhere; their audio would otherwise stay here forever.
  pruneAudio(new Set(list.map((s) => s.id)), listedAt).catch(() => {})
  return list
}
const storiesFeed = feed('stories', fetchStories)

/**
 * Every story, newest first (in kid mode only the folders the child may see): the server's list,
 * or this device's copy when the server does not answer in a few seconds.
 */
export const listStories = async () => kidStories(await storiesFeed.list())

/** Like watchRecipes: this device's stories right away, then the server's (kid mode applied to both). */
export const watchStories = (onList: (list: Story[]) => void, onError?: (err: unknown) => void) =>
  storiesFeed.watch((list) => onList(kidStories(list)), onError)

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
  track({ t: 'offline-saved' })
}

export { getAudio as getOfflineAudio, removeAudio as removeOfflineAudio }

export async function createStory(story: Omit<Story, 'id' | 'createdAt'>) {
  const { mine: _m, shared, spaceName: _n, ...s } = story
  // A new story stays in our space unless sharing was asked for.
  const share = shared ?? false
  const res = await client.models.Story.create({
    ...s, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(share), sharedDirect: share, spaceName: mySpaceName(),
  })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Eroare la salvare')
  await storiesFeed.changed(upsert(toStory(res.data)))
  track({ t: 'story-added', source: story.source })
  if (story.coverKey) track({ t: 'story-cover' })
  return res.data.id
}

export async function deleteStory(s: Story) {
  await deleteWithFiles([s.audioKey, s.coverKey], () => client.models.Story.delete({ id: s.id }))
  await removeAudio(s.id).catch(() => {})
  await storiesFeed.changed(without(s.id))
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
  await storiesFeed.changed((list) => list.map(change), false)
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
  return { shared, changed: !!shared !== !!s.shared }
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

/** A new folder starts shared, like stories, unless `shared` says otherwise. */
export async function createFolder(name: string, icon?: string, shared = true) {
  const res = await client.models.StoryFolder.create({
    name, icon: icon ?? null, spaceGroups: [await mySpaceGroup()], readerGroups: readerGroupsFor(shared), spaceName: mySpaceName(),
  })
  errorsOf(res)
  if (!res.data) throw new Error('Nu am putut crea folderul.')
  cacheFolders([...cachedFolders(), { id: res.data.id, name, icon, mine: true, shared }])
  track({ t: 'folder-made' })
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
    // Only our own stories: another space's folder of the same name is a different folder (and not ours to change).
    for (const s of stories.filter((x) => x.mine !== false && x.collection === oldName)) errorsOf(await client.models.Story.update({ id: s.id, collection: name }))
    await patchCachedStories((x) => (x.mine !== false && x.collection === oldName ? { ...x, collection: name } : x))
  }
}

/** Removes a folder; its stories are kept and go back to their own folder by how they were made. */
export async function deleteFolder(name: string, row: StoryFolder | undefined, stories: Story[]) {
  kidFolderRenamed(name)
  for (const s of stories.filter((x) => x.mine !== false && x.collection === name)) errorsOf(await client.models.Story.update({ id: s.id, collection: null }))
  await patchCachedStories((x) => (x.mine !== false && x.collection === name ? { ...x, collection: undefined } : x))
  if (row) errorsOf(await client.models.StoryFolder.delete({ id: row.id }))
  cacheFolders(cachedFolders().filter((f) => f.name !== name))
}

// ---- long AI work (runs in the background, see amplify/shared/jobs.ts) ----

/**
 * Starts AI work that can take longer than the 30 s a request may last, and waits for its outcome:
 * the function writes it to a file in our space folder, which is read through one signed link
 * (S3 answers 403/404 until it is there), then deleted. `limit` is a bit more than the function's own timeout.
 */
async function runJob<T>(start: (jobId: string) => Promise<{ errors?: { message: string }[] | null }>, limit: number): Promise<T> {
  const jobId = newId()
  const path = jobPath(await mySpaceGroup(), jobId)
  const res = await start(jobId)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  const url = await fileUrl(path)
  const until = Date.now() + limit
  for (let wait = 1500; Date.now() < until; wait = Math.min(wait + 500, 4000)) {
    await sleep(wait)
    const r = await fetch(url, { cache: 'no-store' }).catch(() => undefined)
    if (!r?.ok) continue
    const out = (await r.json().catch(() => undefined)) as JobOutcome<T> | undefined
    if (!out) continue
    removeFile(path).catch(() => {})
    if (!out.ok) throw new Error(out.error)
    return out.data
  }
  throw new Error('Durează mai mult decât de obicei. Verifică internetul și încearcă din nou.')
}

// The functions' own time limits (amplify/functions/*/resource.ts), plus a margin.
const RECIPE_JOB_MS = 150_000
const STORY_JOB_MS = 210_000

// ---- recipe import ----

export type ImportedRecipe = NonNullable<Awaited<ReturnType<typeof client.queries.importRecipe>>['data']>

async function runImport(args: { url?: string; photoKey?: string; photoKeys?: string[]; text?: string; idea?: string; tools?: string[]; servings?: number; diet?: string; adaptFrom?: string }) {
  const data = await runJob<ImportedRecipe | null>((jobId) => client.mutations.startImportRecipe({ jobId, ...args }), RECIPE_JOB_MS)
  if (!data?.title) throw new Error('Nu am găsit o rețetă aici.')
  return data
}

export const importRecipeFromUrl = (url: string) => runImport({ url })

/** Lets Claude structure free text (dictated, or pasted without clear headings). */
export const importRecipeFromText = (text: string) => runImport({ text })

export type RecipeIdea = { title: string; description?: string | null; tools?: (string | null)[] | null; missing?: (string | null)[] | null; minutes?: number | null; kcal?: number | null; swaps?: (string | null)[] | null }

/** Asks Claude for a few dishes that can be made from what is in the fridge. */
export async function suggestRecipes(ingredients: string, tools: string[], diet?: string): Promise<RecipeIdea[]> {
  const data = await runJob<(RecipeIdea | null)[] | null>((jobId) => client.mutations.startSuggestRecipes({ jobId, ingredients, tools, diet: diet || null }), RECIPE_JOB_MS)
  return (data ?? []).filter((x): x is RecipeIdea => !!x)
}

/** Asks Claude for a new recipe from an idea, using only the given kitchen tools. */
export const generateRecipe = (idea: string, tools: string[], servings?: number, diet?: string) => runImport({ idea, tools, servings, diet: diet || undefined })

/** Rewrites a saved recipe so it fits the family's diet (a new recipe, the original stays). */
export const adaptRecipe = (r: Recipe, diet: string, tools: string[]) =>
  runImport({ adaptFrom: JSON.stringify({ title: r.title, servings: r.servings, ingredients: r.ingredients, steps: r.steps, notes: r.notes }), diet, tools })

export type PlannedDinner = { day: string; kind: 'existing' | 'new' | 'leftovers'; recipeId?: string; title: string; reason?: string; recipe?: ImportedRecipe }

/** Plans the given evenings' dinners (AI): from our recipes, and a few new ones when allowed. */
export async function planWeek(args: { days: string; recipes: string; recent: string[]; fridge?: string; diet?: string; tools: string[]; allowNew: boolean; swapDay?: string; keep?: string[] }): Promise<PlannedDinner[]> {
  const data = await runJob<PlannedDinner[] | null>((jobId) => client.mutations.startPlanWeek({ jobId, ...args }), RECIPE_JOB_MS)
  if (!Array.isArray(data)) throw new Error('Nu am putut citi planul.')
  return data
}

/** Draws a photo for a recipe with AI and returns its storage path. */
export async function generateRecipePhoto(title: string, ingredients: string[]): Promise<string> {
  const res = await client.mutations.generateRecipePhoto({ title, ingredients })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data) throw new Error('Nu am putut genera poza.')
  return res.data
}

/** One recipe from one or more photos (pages of a book, both sides of a note), read together. */
export async function importRecipeFromPhotos(photos: Blob[]) {
  const photoKeys: string[] = []
  try {
    for (const p of photos) photoKeys.push(await uploadFile('recipe-photos', p, 'jpg'))
    return await runImport({ photoKeys })
  } finally {
    await Promise.all(photoKeys.map((k) => removeFile(k).catch(() => {})))
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

export type GeneratedStory = { text: string; audioKey: string; narrator?: string | null; note?: string | null }

export async function generateStory(args: { title: string; text?: string; voice?: string } & StoryBrief) {
  const data = await runJob<GeneratedStory | null>((jobId) => client.mutations.startGenerateStory({ jobId, ...args }), STORY_JOB_MS)
  if (!data?.audioKey) throw new Error('Nu am putut crea povestea.')
  return data
}

/** How long an audio file is, read from its metadata (undefined if the browser can't tell). */
function audioSeconds(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const a = new Audio()
    const done = (v?: number) => { a.removeAttribute('src'); resolve(v) }
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : undefined)
    a.onerror = () => done()
    setTimeout(() => done(), 15000)
    a.src = url
  })
}

/**
 * Reads a saved story again from its text, in another voice (empty = Polly). The story keeps its
 * title, cover, folder and favourite; only the audio changes (the old file is deleted, and so is
 * this phone's offline copy). Returns the updated story and why it fell back to Polly, if it did.
 */
export async function renarrateStory(s: Story, voice: string): Promise<{ story: Story; note?: string | null }> {
  if (!s.text?.trim()) throw new Error('Povestea nu are text salvat.')
  const g = await generateStory({ title: s.title, text: s.text, voice: voice || undefined })
  const secs = await audioSeconds(await fileUrl(g.audioKey)).catch(() => undefined)
  const durationSec = secs ? Math.round(secs) : null
  const old = s.audioKey
  owners.set(old, `Story:${s.id}`)
  const res = await client.models.Story.update({ id: s.id, audioKey: g.audioKey, durationSec })
  if (res.errors?.length) {
    await removeFile(g.audioKey).catch(() => {})
    throw new Error(res.errors.map((e) => e.message).join('; '))
  }
  fileOwner(`Story:${s.id}`, g.audioKey)
  await removeAudio(s.id).catch(() => {})
  if (old !== g.audioKey) await removeFile(old).catch(() => {})
  const story = { ...s, audioKey: g.audioKey, durationSec: durationSec ?? undefined }
  await storiesFeed.changed((list) => list.map((x) => (x.id === s.id ? story : x)), false)
  return { story, note: g.note }
}

export type NarratorVoice = { id: string; name: string; description?: string | null; gender?: string | null; age?: string | null; accent?: string | null; category?: string | null; romanian?: boolean | null }

/** The voices in the family's ElevenLabs account. */
export async function narratorVoices(): Promise<NarratorVoice[]> {
  const res = await client.queries.narratorVoices()
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return (res.data ?? []).filter((v): v is NarratorVoice => !!v)
}

/** A short Romanian sample read by one voice, as an MP3 data URL. */
export async function previewVoice(voice: string): Promise<string> {
  const res = await client.queries.previewVoice({ voice })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data) throw new Error('Nu am primit mostra.')
  return `data:audio/mpeg;base64,${res.data}`
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
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Nu am putut salva coperta.')
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
  await storiesFeed.changed((list) => list.map((x) => (x.id === s.id ? { ...x, favorite } : x)), false)
}

export async function setStoryCover(s: Story, coverKey: string) {
  const old = s.coverKey && s.coverKey !== coverKey ? s.coverKey : undefined
  if (old) owners.set(old, `Story:${s.id}`)
  const res = await client.models.Story.update({ id: s.id, coverKey })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  fileOwner(`Story:${s.id}`, coverKey)
  if (old) await removeFile(old)
  track({ t: 'story-cover' })
}

/**
 * The drawn cover: emoji and colours. With `dropPicture` the cover picture goes, so the drawing
 * shows (the picture file is deleted).
 */
export async function setStoryDrawing(s: Story, emoji: string, scene: number, dropPicture = false) {
  const old = dropPicture ? s.coverKey : undefined
  if (old) owners.set(old, `Story:${s.id}`)
  const res = await client.models.Story.update({ id: s.id, emoji, scene, ...(dropPicture ? { coverKey: null } : {}) })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (old) await removeFile(old).catch(() => {})
  await storiesFeed.changed((list) => list.map((x) => (x.id === s.id ? { ...x, emoji, scene, ...(dropPicture ? { coverKey: undefined } : {}) } : x)), false)
  track({ t: 'story-cover' })
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
  if (!resend) track({ t: 'invited' })
  return res.data
}

// ---- meal plan ("Săptămâna mea") and shopping list ----

type PlanRow = Schema['MealPlanEntry']['type']
type ShoppingRow = Schema['ShoppingItem']['type']

/**
 * The server was reached and refused the change (as opposed to not being reached at all, which
 * throws a plain error). `conditional`: the row was already there (made before, the answer got
 * lost) or already gone, so the change has nothing left to do. See lib/synced.ts.
 */
export class Rejected extends Error {
  name = 'Rejected'
  readonly conditional: boolean
  constructor(message: string, conditional: boolean) { super(message); this.conditional = conditional }
}

const check = (res: { errors?: { message: string; errorType?: string }[] | null }) => {
  if (!res.errors?.length) return
  // Amplify also reports "server not reached" (no signal) in `errors`, but without the errorType
  // AppSync puts on every answer of its own ("Unauthorized", "DynamoDB:…").
  const reached = res.errors.every((e) => !!e.errorType && !/network error/i.test(e.message))
  if (!reached) throw new Error(res.errors.map((e) => e.message).join('; '))
  const conditional = res.errors.every((e) => /ConditionalCheckFailed/.test(e.errorType ?? '') || /conditional request failed/i.test(e.message))
  throw new Rejected(res.errors.map((e) => e.message).join('; '), conditional)
}

const toPlan = (p: PlanRow): PlanEntry => ({ id: p.id, day: p.day, recipeId: p.recipeId, servings: p.servings ?? undefined, leftovers: p.leftovers ?? undefined })
const toShopping = (s: ShoppingRow): ShoppingItem => ({
  id: s.id, text: s.text, checked: !!s.checked, recipeId: s.recipeId ?? undefined, recipeTitle: s.recipeTitle ?? undefined, createdAt: s.createdAt,
})

export const planApi = {
  list: async () => (await listAll((nextToken) => client.models.MealPlanEntry.list({ nextToken, limit: 500 }))).map(toPlan),
  create: async (p: PlanEntry) => check(await client.models.MealPlanEntry.create({ ...p, servings: p.servings ?? null, leftovers: p.leftovers ?? null, spaceGroups: [await mySpaceGroup()] })),
  update: async (p: PlanEntry) => check(await client.models.MealPlanEntry.update({ ...p, servings: p.servings ?? null, leftovers: p.leftovers ?? null })),
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

// ---- what the space remembers about each recipe (favourite, days cooked, notes) ----

type RecipeLogRow = Schema['RecipeLog']['type']
const toLog = (l: RecipeLogRow): RecipeLog => ({
  id: l.id, recipeId: l.recipeId, favorite: !!l.favorite,
  cooked: (l.cooked ?? []).filter((x): x is string => !!x),
  notes: (l.notes ?? []).flatMap((x) => { try { return x ? [JSON.parse(x)] : [] } catch { return [] } }),
})
const logFields = (l: RecipeLog) => ({ favorite: l.favorite, cooked: l.cooked, notes: l.notes.map((n) => JSON.stringify(n)) })

export const recipeLogApi = {
  list: async () => (await listAll((nextToken) => client.models.RecipeLog.list({ nextToken, limit: 500 }))).map(toLog),
  create: async (l: RecipeLog) => check(await client.models.RecipeLog.create({ id: l.id, recipeId: l.recipeId, ...logFields(l), spaceGroups: [await mySpaceGroup()] })),
  update: async (l: RecipeLog) => check(await client.models.RecipeLog.update({ id: l.id, ...logFields(l) })),
  remove: async (id: string) => check(await client.models.RecipeLog.delete({ id })),
}

// ---- space settings (one row per space, id = the space group) ----

let namesChecked = false
/**
 * Other spaces show what we share under our space's name, as saved on each row. If the name
 * changed since something was shared, put the new one on those rows (once per app start), so
 * the others' "Primite de la …" folders don't split in two.
 */
async function refreshSharedNames(name: string | undefined) {
  if (namesChecked || !name) return
  namesChecked = true
  const stale = <T extends { mine?: boolean; shared?: boolean; spaceName?: string }>(xs?: T[]) => (xs ?? []).filter((x) => x.mine && x.shared && x.spaceName && x.spaceName !== name)
  const [stories, recipes] = await Promise.all([cachedList('stories').catch(() => undefined), cachedList('recipes').catch(() => undefined)])
  for (const s of stale(stories)) errorsOf(await client.models.Story.update({ id: s.id, spaceName: name }))
  for (const r of stale(recipes)) errorsOf(await client.models.Recipe.update({ id: r.id, spaceName: name }))
  if (!stale(stories).length && !stale(recipes).length) return
  for (const f of cachedFolders().filter((f) => f.mine !== false && f.shared)) errorsOf(await client.models.StoryFolder.update({ id: f.id, spaceName: name }))
}

/** The space's settings from the cloud, or null if they were never saved there. */
export async function getFamilySettings(): Promise<(Omit<SharedSettings, 'city' | 'kid' | 'diet' | 'narrator'> & { city?: string; kid?: SharedSettings['kid']; diet?: SharedSettings['diet']; narrator?: SharedSettings['narrator'] }) | null> {
  const res = await client.models.FamilySettings.get({ id: await mySpaceGroup() })
  check(res)
  const r = res.data
  if (!r) return null
  rememberSpaceName(r.spaceName)
  refreshSharedNames(r.spaceName ?? undefined).catch(() => {})
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
    diet: parseDiet(r.diet),
    // Rows saved before the narrator setting existed have none: keep this device's choice then.
    narrator: r.narrator == null ? undefined : { id: r.narrator, name: r.narratorName ?? '' },
  }
}

/**
 * Renames the space: the name other accounts see on what it shares ("Primite de la …"). Saved on
 * the space's settings row, then put on the rows already shared, so their folders don't split.
 */
export async function renameSpace(name: string) {
  const v = name.trim().slice(0, 40)
  if (!v) throw new Error('Scrie un nume.')
  setMySpaceName(v)
  const { child, city, kitchenTools, kid, diet, narrator } = getSettings()
  await saveFamilySettings({ child, city, kitchenTools, kid, diet, narrator })
  namesChecked = false
  await refreshSharedNames(v)
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
    diet: JSON.stringify(s.diet),
    narrator: s.narrator.id,
    narratorName: s.narrator.name,
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

// ---- one person's stamps and stickers (src/lib/badges/store.ts) ----

export const badgeBookApi = {
  /** The saved progress (JSON), or undefined when this account has none yet. */
  async get(id: string) {
    const res = await client.models.BadgeBook.get({ id })
    errorsOf(res)
    return res.data ? { state: res.data.state } : undefined
  },
  async put(id: string, state: string, exists: boolean) {
    errorsOf(exists ? await client.models.BadgeBook.update({ id, state }) : await client.models.BadgeBook.create({ id, state }))
  },
}
