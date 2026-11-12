import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

// A monthly cap on paid AI work, per space (household), so a stuck retry or a child tapping
// "create" again and again cannot run up the AWS or ElevenLabs bill. The counts live in
// ai-usage/<space>/<YYYY-MM>.json; a new month starts from zero. Răgaz's chat has its own
// limit per person (shared/mindCoach.ts).

export const USAGE_PREFIX = 'ai-usage'

/** What is counted, and how many a space may use in a month. */
export const MONTHLY_AI_LIMITS = {
  /** Stories written and/or narrated (Claude + ElevenLabs or Polly). */
  story: 60,
  /** Voice samples played in the voice picker (ElevenLabs credits). */
  voice: 150,
  /** Recipe work with Claude: import, ideas, week plan, nutrition. */
  recipe: 400,
  /** Recipe photos drawn by AI. */
  photo: 60,
} as const
export type AiKind = keyof typeof MONTHLY_AI_LIMITS
export type AiUsage = { month: string } & Partial<Record<AiKind, number>>

const WHAT: Record<AiKind, string> = {
  story: 'povești create',
  voice: 'mostre de voce',
  recipe: 'cereri AI pentru rețete',
  photo: 'poze desenate de AI',
}

export const usagePath = (space: string, month: string) => `${USAGE_PREFIX}/${space}/${month}.json`
export const thisMonth = (now = new Date()) => now.toISOString().slice(0, 7)

/** The month's counts for a space (all zero when nothing was used yet). */
export async function readUsage(s3: S3Client, bucket: string, space: string, month = thisMonth()): Promise<AiUsage> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: usagePath(space, month) }))
    const u = JSON.parse(await res.Body!.transformToString()) as AiUsage
    return { ...u, month }
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return { month }
    throw err
  }
}

/**
 * Counts one use against the space's monthly limit, or throws (in Romanian, shown in the app)
 * when the limit is reached. A caller without a space is not counted: every account has one.
 */
export async function countAi(s3: S3Client, bucket: string, space: string | undefined, kind: AiKind) {
  if (!space) return
  const month = thisMonth()
  const usage = await readUsage(s3, bucket, space, month)
  const used = usage[kind] ?? 0
  const limit = MONTHLY_AI_LIMITS[kind]
  if (used >= limit) throw new Error(`Ați ajuns la limita lunii: ${limit} ${WHAT[kind]}. Se reia pe 1 ale lunii viitoare.`)
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: usagePath(space, month), ContentType: 'application/json',
    Body: JSON.stringify({ ...usage, [kind]: used + 1 }),
  }))
}

/**
 * Gives one use back, for work that found nothing to keep (a shared video that is not a recipe):
 * that attempt should not eat into the month.
 */
export async function refundAi(s3: S3Client, bucket: string, space: string | undefined, kind: AiKind) {
  if (!space) return
  const month = thisMonth()
  const usage = await readUsage(s3, bucket, space, month)
  const used = usage[kind] ?? 0
  if (used <= 0) return
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: usagePath(space, month), ContentType: 'application/json',
    Body: JSON.stringify({ ...usage, [kind]: used - 1 }),
  }))
}

/** The importer's "no recipe here" answers ("Nu am găsit rețeta…", "Nu am găsit o rețetă aici."). */
export const isNoRecipe = (err: unknown) => /^Nu am găsit (o )?rețet/.test((err as Error)?.message ?? '')
