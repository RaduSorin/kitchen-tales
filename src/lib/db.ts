// Cloud storage via AWS Amplify: recipe/story records in DynamoDB,
// photos and audio files in S3. Visible to every signed-in family member.
import { generateClient } from 'aws-amplify/data'
import { getUrl, remove, uploadData } from 'aws-amplify/storage'
import type { Schema } from '../../amplify/data/resource'
import type { Recipe, Story, StorySource } from './types'

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
  notes: r.notes ?? undefined,
  sourceUrl: r.sourceUrl ?? undefined,
  photoKey: r.photoKey ?? undefined,
  updatedAt: r.updatedAt,
})

const toStory = (s: StoryRow): Story => ({
  id: s.id,
  title: s.title,
  emoji: s.emoji ?? '⭐',
  source: (s.source ?? 'upload') as StorySource,
  audioKey: s.audioKey,
  durationSec: s.durationSec ?? undefined,
  text: s.text ?? undefined,
  createdAt: s.createdAt,
})

async function listAll<T>(fetchPage: (nextToken?: string | null) => Promise<{ data: T[]; nextToken?: string | null }>) {
  const out: T[] = []
  let token: string | null | undefined
  do {
    const page = await fetchPage(token)
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

export async function uploadFile(prefix: 'recipe-photos' | 'stories', blob: Blob, fallbackExt: string) {
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
  const rows = await listAll((nextToken) => client.models.Recipe.list({ nextToken, limit: 200 }))
  return rows.map(toRecipe).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export async function getRecipe(id: string) {
  const { data } = await client.models.Recipe.get({ id })
  return data ? toRecipe(data) : undefined
}

export async function saveRecipe(r: Recipe, isNew: boolean) {
  const { updatedAt: _, ...fields } = r
  const input = { ...fields, category: fields.category || null, notes: fields.notes || null, sourceUrl: fields.sourceUrl || null,
    servings: fields.servings ?? null, minutes: fields.minutes ?? null, photoKey: fields.photoKey ?? null }
  const res = isNew ? await client.models.Recipe.create(input) : await client.models.Recipe.update(input)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
}

export async function deleteRecipe(r: Recipe) {
  await client.models.Recipe.delete({ id: r.id })
  await removeFile(r.photoKey)
}

export { removeFile }

// ---- stories ----

export async function listStories() {
  const rows = await listAll((nextToken) => client.models.Story.list({ nextToken, limit: 200 }))
  return rows.map(toStory).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function getStory(id: string) {
  const { data } = await client.models.Story.get({ id })
  return data ? toStory(data) : undefined
}

export async function createStory(s: Omit<Story, 'id' | 'createdAt'>) {
  const res = await client.models.Story.create(s)
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') ?? 'Eroare la salvare')
  return res.data.id
}

export async function deleteStory(s: Story) {
  await client.models.Story.delete({ id: s.id })
  await removeFile(s.audioKey)
}

// ---- recipe import ----

export type ImportedRecipe = NonNullable<Awaited<ReturnType<typeof client.queries.importRecipe>>['data']>

async function runImport(args: { url?: string; photoKey?: string }) {
  const res = await client.queries.importRecipe(args)
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  if (!res.data?.title) throw new Error('Nu am găsit o rețetă aici.')
  return res.data
}

export const importRecipeFromUrl = (url: string) => runImport({ url })

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
