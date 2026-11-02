import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'

const s3 = new S3Client({})
const BUCKET = process.env.KITCHEN_TALES_FILES_BUCKET_NAME!
const UA = 'KitchenTales/1.0 (private family app; https://github.com/RaduSorin/kitchen-tales)'
const MAX_IMAGE_BYTES = 5_000_000
// Only pictures from these hosts can be copied, so the function can't be used to fetch arbitrary URLs.
const IMAGE_HOSTS = ['.mzstatic.com', '.wikimedia.org']

type Candidate = { url: string; source: 'itunes' | 'wikipedia'; label: string }
type ItunesResult = { artworkUrl100?: string; collectionName?: string; trackName?: string; artistName?: string }
type WikiPage = { index: number; title: string; thumbnail?: { source: string } }
type Args = { title?: string | null; artist?: string | null; url?: string | null }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
  return res.json() as Promise<T>
}

// Albums, films and audiobooks with this title. Artwork comes as 100px; the same path serves 600px.
async function fromItunes(term: string): Promise<Candidate[]> {
  const kinds = ['media=music&entity=album', 'media=movie&entity=movie', 'media=audiobook&entity=audiobook']
  const pages = await Promise.allSettled(kinds.map((k) =>
    getJson<{ results?: ItunesResult[] }>(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&${k}&limit=4&country=ro`)))
  return pages.flatMap((p) => (p.status === 'fulfilled' ? p.value.results ?? [] : []))
    .filter((r) => r.artworkUrl100)
    .map((r): Candidate => ({
      url: String(r.artworkUrl100).replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.jpg'),
      source: 'itunes',
      label: [r.collectionName ?? r.trackName, r.artistName].filter(Boolean).join(' · '),
    }))
}

// Lead images of matching Romanian and English Wikipedia articles (film posters, book covers, characters).
async function fromWikipedia(term: string): Promise<Candidate[]> {
  const pages = await Promise.allSettled(['ro', 'en'].map((lang) =>
    getJson<{ query?: { pages?: Record<string, WikiPage> } }>(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3`
      + `&gsrsearch=${encodeURIComponent(term)}&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any`)))
  return pages.flatMap((p) => (p.status === 'fulfilled' ? Object.values(p.value.query?.pages ?? {}) : []))
    .sort((a, b) => a.index - b.index)
    .filter((pg) => pg.thumbnail?.source)
    .map((pg): Candidate => ({ url: pg.thumbnail!.source, source: 'wikipedia', label: pg.title }))
}

async function search(title: string, artist?: string | null) {
  const term = title.replace(/\s+/g, ' ').trim().slice(0, 100)
  const [itunes, wiki] = await Promise.all([
    fromItunes(artist ? `${term} ${artist}` : term).then((r) => (r.length || !artist ? r : fromItunes(term))).catch(() => []),
    fromWikipedia(term).catch(() => []),
  ])
  const seen = new Set<string>()
  return [...itunes, ...wiki].filter((c) => !seen.has(c.url) && !!seen.add(c.url)).slice(0, 9)
}

async function save(url: string) {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.some((h) => u.hostname.endsWith(h))) throw new Error('Imaginea nu vine dintr-o sursă cunoscută.')
  const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'error', signal: AbortSignal.timeout(10000) })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) throw new Error('Nu am putut descărca imaginea.')
  const body = new Uint8Array(await res.arrayBuffer())
  if (body.length > MAX_IMAGE_BYTES) throw new Error('Imaginea este prea mare.')
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const key = `story-covers/${randomUUID()}.${ext}`
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: type }))
  return key
}

// Two operations share this function: search by title, or copy a chosen picture (url) into S3.
export const handler = async (event: { arguments: Args; fieldName?: string }) => {
  const { title, artist, url } = event.arguments
  if (event.fieldName === 'saveCover') return save(url ?? '')
  if (!title?.trim()) return []
  return search(title, artist)
}
