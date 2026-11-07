import { BatchGetItemCommand, DynamoDBClient, type AttributeValue, type BatchGetItemCommandOutput } from '@aws-sdk/client-dynamodb'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { FILE_PREFIXES, fileSpace, type FilePrefix } from '../../shared/files'
import { spaceOf } from '../../shared/spaces'

const s3 = new S3Client({})
const ddb = new DynamoDBClient({})
const BUCKET = process.env.BUCKET_NAME!
const TABLES = { Story: process.env.STORY_TABLE!, Recipe: process.env.RECIPE_TABLE! }
const LINK_SECONDS = 3600

type Model = keyof typeof TABLES
type Row = { spaceGroups: string[]; readerGroups: string[]; files: Set<string> }

const strings = (v?: AttributeValue) => (v?.L ?? []).map((x) => x.S).filter((x): x is string => !!x)
/** The row's groups and every file path it points at. */
function toRow(model: Model, item: Record<string, AttributeValue>): Row {
  const files = model === 'Story' ? [item.audioKey?.S, item.coverKey?.S] : [item.photoKey?.S, ...strings(item.stepPhotoKeys)]
  return { spaceGroups: strings(item.spaceGroups), readerGroups: strings(item.readerGroups), files: new Set(files.filter((f): f is string => !!f)) }
}

/** "Story:<id>" or "Recipe:<id>" → the row, for files that are not in the caller's own space. */
async function loadRows(refs: string[]) {
  const wanted = new Map<Model, Set<string>>()
  for (const ref of refs) {
    const [model, id] = ref.split(':') as [Model, string]
    if (TABLES[model] && id) (wanted.get(model) ?? wanted.set(model, new Set()).get(model)!).add(id)
  }
  const rows = new Map<string, Row>()
  for (const [model, ids] of wanted) {
    const all = [...ids]
    for (let i = 0; i < all.length; i += 100) {
      let keys: Record<string, AttributeValue>[] | undefined = all.slice(i, i + 100).map((id) => ({ id: { S: id } }))
      // Unprocessed keys come back when the table is busy: ask again a few times.
      for (let tries = 0; keys?.length && tries < 4; tries++) {
        const res: BatchGetItemCommandOutput = await ddb.send(new BatchGetItemCommand({ RequestItems: { [TABLES[model]]: { Keys: keys, ProjectionExpression: 'id, spaceGroups, readerGroups, audioKey, coverKey, photoKey, stepPhotoKeys' } } }))
        for (const item of res.Responses?.[TABLES[model]] ?? []) rows.set(`${model}:${item.id.S}`, toRow(model, item))
        keys = res.UnprocessedKeys?.[TABLES[model]]?.Keys
      }
    }
  }
  return rows
}

const known = (path: string) => FILE_PREFIXES.some((p) => path.startsWith(`${p}/`)) && !path.includes('..')
const meets = (groups: string[], allowed: string[]) => allowed.some((g) => groups.includes(g))

/**
 * Whether the caller may read (or delete) a file: files in its own space folder always;
 * any other file (another space's, or one stored before spaces had folders) only through a row
 * the caller can read (or edit) that points at it.
 */
function allowed(path: string, ref: string | undefined, rows: Map<string, Row>, groups: string[], mySpace: string | undefined, write: boolean) {
  if (!path || !known(path)) return false
  const own = fileSpace(path)
  if (own) {
    if (own === mySpace) return true
    if (write) return false
  }
  const row = ref ? rows.get(ref) : undefined
  if (!row || !row.files.has(path)) return false
  return meets(groups, write ? row.spaceGroups : [...row.spaceGroups, ...row.readerGroups])
}

type Event = {
  fieldName: string
  arguments: { paths?: (string | null)[] | null; refs?: (string | null)[] | null; prefix?: string; ext?: string; contentType?: string | null }
  identity?: { groups?: string[] | null }
}

export const handler = async (event: Event) => {
  const groups = event.identity?.groups ?? []
  const mySpace = spaceOf(groups)
  const paths = (event.arguments.paths ?? []).slice(0, 100).map((p) => p ?? '')
  const refs = (event.arguments.refs ?? []).map((r) => r ?? undefined)

  if (event.fieldName === 'uploadUrl') {
    // New files go in the caller's space folder, under a fresh name, so nothing can be overwritten.
    const prefix = event.arguments.prefix as FilePrefix
    // ai-jobs/ holds what the AI functions write for the app (shared/jobs.ts), never uploads.
    if (!FILE_PREFIXES.includes(prefix) || prefix === 'ai-jobs') throw new Error('Unknown file kind')
    if (!mySpace) throw new Error('Contul tău nu are încă un spațiu.')
    const ext = (event.arguments.ext ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
    const path = `${prefix}/${mySpace}/${randomUUID()}.${ext}`
    const contentType = event.arguments.contentType || undefined
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: path, ContentType: contentType }), { expiresIn: 900 })
    return { path, url }
  }

  const needRows = paths.map((p, i) => (fileSpace(p) && fileSpace(p) === mySpace ? undefined : refs[i])).filter((r): r is string => !!r)
  const rows = needRows.length ? await loadRows([...new Set(needRows)]) : new Map<string, Row>()

  if (event.fieldName === 'fileUrls') {
    // One link per path, in order; '' for a file the caller may not read.
    return Promise.all(paths.map((p, i) => (allowed(p, refs[i], rows, groups, mySpace, false)
      ? getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: p }), { expiresIn: LINK_SECONDS })
      : '')))
  }
  if (event.fieldName === 'deleteFiles') {
    const ok = paths.filter((p, i) => allowed(p, refs[i], rows, groups, mySpace, true))
    await Promise.all(ok.map((p) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: p }))))
    return ok.length
  }
  throw new Error(`Unknown field ${event.fieldName}`)
}
