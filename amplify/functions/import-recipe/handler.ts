import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type ImageFormat } from '@aws-sdk/client-bedrock-runtime'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Schema } from '../../data/resource'

const bedrock = new BedrockRuntimeClient({})
const s3 = new S3Client({})
const BUCKET = process.env.KITCHEN_TALES_FILES_BUCKET_NAME!
const MODEL_ID = process.env.MODEL_ID!

const CATEGORIES = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']
const MAX_PAGE_BYTES = 3_000_000
const MAX_TEXT_CHARS = 40_000

type Imported = {
  title: string
  category?: string
  servings?: number
  minutes?: number
  ingredients: string[]
  steps: string[]
  notes?: string
  sourceUrl?: string
  photoKey?: string
}

const SYSTEM = `Extragi rețete culinare din pagini web sau din fotografii (text tipărit sau scris de mână).
Răspunde întotdeauna apelând unealta save_recipe.
Reguli:
- Scrie totul în limba română, cu diacritice. Dacă sursa e în altă limbă, traduce natural.
- Păstrează cantitățile exact; convertește unitățile imperiale în metrice (g, ml, °C).
- Un ingredient pe element, de forma „500 g făină”. Un pas pe element, fără numerotare.
- Categoria trebuie să fie una dintre: ${CATEGORIES.join(', ')}.
- Nu inventa. Ce nu apare în sursă rămâne gol.
- Dacă sursa nu conține o rețetă, pune title = "" și listele goale.`

const TOOL = {
  toolSpec: {
    name: 'save_recipe',
    description: 'Salvează rețeta extrasă.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          servings: { type: 'integer' },
          minutes: { type: 'integer', description: 'Timp total de preparare, în minute' },
          ingredients: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', description: 'Sfaturi sau variante menționate în sursă' },
        },
        required: ['title', 'ingredients', 'steps'],
      },
    },
  },
}

async function askModel(content: ContentBlock[], system = SYSTEM): Promise<Imported> {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: system }],
    messages: [{ role: 'user', content }],
    toolConfig: { tools: [TOOL], toolChoice: { tool: { name: 'save_recipe' } } },
    inferenceConfig: { maxTokens: 4000 },
  }))
  const block = res.output?.message?.content?.find((c) => c.toolUse)
  const input = (block?.toolUse?.input ?? {}) as Partial<Imported>
  return {
    title: (input.title ?? '').trim(),
    category: input.category,
    servings: input.servings,
    minutes: input.minutes,
    ingredients: input.ingredients ?? [],
    steps: input.steps ?? [],
    notes: input.notes,
  }
}

// ---- web pages ----

export function findJsonLdRecipe(html: string): unknown {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const isRecipe = (n: any) => n && (n['@type'] === 'Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe')))
  const walk = (n: any): any => {
    if (!n || typeof n !== 'object') return undefined
    if (isRecipe(n)) return n
    for (const v of Array.isArray(n) ? n : [n['@graph'], ...Object.values(n)]) {
      const hit = walk(v)
      if (hit) return hit
    }
    return undefined
  }
  for (const m of html.matchAll(re)) {
    try {
      const hit = walk(JSON.parse(m[1].trim()))
      if (hit) return hit
    } catch { /* malformed JSON-LD, try the next block */ }
  }
  return undefined
}

export function pageText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

export function imageUrlFrom(recipe: any, html: string, base: string): string | undefined {
  let img = recipe?.image
  if (Array.isArray(img)) img = img[0]
  if (img && typeof img === 'object') img = img.url
  if (typeof img !== 'string') img = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
  if (!img) return undefined
  try { return new URL(img, base).toString() } catch { return undefined }
}

async function savePhotoFrom(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return undefined
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > 8_000_000) return undefined
    const ext = type.split('/')[1].split(';')[0].replace('jpeg', 'jpg')
    const key = `recipe-photos/${crypto.randomUUID()}.${ext}`
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: type }))
    return key
  } catch {
    return undefined
  }
}

async function fromUrl(raw: string): Promise<Imported> {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Linkul trebuie să înceapă cu http:// sau https://')
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (KitchenTales recipe import)', 'Accept-Language': 'ro,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 404) throw new Error('Pagina nu există. Verifică linkul.')
  if (res.status === 401 || res.status === 403) throw new Error('Site-ul nu permite citirea automată. Încearcă importul din text sau din poză.')
  if (!res.ok) throw new Error(`Site-ul a răspuns cu eroarea ${res.status}`)
  const html = (await res.text()).slice(0, MAX_PAGE_BYTES)

  const ld = findJsonLdRecipe(html)
  const source = ld
    ? `Date structurate (schema.org Recipe) de pe ${url}:\n${JSON.stringify(ld).slice(0, MAX_TEXT_CHARS)}`
    : `Textul paginii ${url}:\n${pageText(html)}`

  const recipe = await askModel([{ text: source }])
  if (!recipe.title) return recipe
  const img = imageUrlFrom(ld, html, res.url)
  return { ...recipe, sourceUrl: res.url, photoKey: img ? await savePhotoFrom(img) : undefined }
}

// ---- photos ----

/** Detects the image type from its first bytes, so a missing or generic Content-Type doesn't matter. */
function imageFormat(b: Uint8Array): ImageFormat | undefined {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  return undefined
}

async function fromPhoto(key: string): Promise<Imported> {
  if (!key.startsWith('recipe-photos/')) throw new Error('Poză invalidă')
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const bytes = await obj.Body!.transformToByteArray()
  const fmt = imageFormat(bytes)
  if (!fmt) throw new Error('Formatul pozei nu e suportat. Folosește JPG, PNG, WEBP sau GIF.')
  return askModel([
    { image: { format: fmt, source: { bytes } } },
    { text: 'Extrage rețeta din această fotografie.' },
  ])
}

// ---- generation ----

const GENERATE_SYSTEM = `Ești un bucătar care scrie rețete de casă pentru o familie din România.
Răspunde întotdeauna apelând unealta save_recipe.
Reguli:
- Scrie totul în limba română, cu diacritice.
- Rețeta trebuie să fie reală, gustoasă și verificată ca proporții și timpi.
- Un ingredient pe element, cu cantitate metrică la început, de forma „500 g făină”. Un pas pe element, fără numerotare.
- Scrie timpii explicit în pași („fierbi 10 minute”), ca aplicația să poată porni un cronometru.
- Categoria trebuie să fie una dintre: ${CATEGORIES.join(', ')}.
- Folosește DOAR ustensilele de bază (aragaz, cuptor, cratițe, tigaie, cuțite, castroane, tel) și aparatele din lista familiei.
  Nu cere niciun alt aparat. Dacă un aparat din listă ajută, folosește-l și dă setările lui (de exemplu la Thermomix: timp / temperatură / viteză; la oala sub presiune: presiune și timp).
- În notes scrie pe scurt ce aparat folosește rețeta și, dacă e cazul, cum se face fără el.
- Dacă cererea nu e despre mâncare, pune title = "" și listele goale.`

const MAX_IDEA_CHARS = 1000
const MAX_TOOLS = 30

function generate(idea: string, tools: string[], servings?: number | null): Promise<Imported> {
  const list = tools.map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, MAX_TOOLS)
  const text = [
    `Cererea: ${idea.trim().slice(0, MAX_IDEA_CHARS)}`,
    `Aparatele familiei: ${list.length ? list.join(', ') : 'doar ustensilele de bază'}.`,
    servings ? `Porții: ${servings}.` : '',
  ].filter(Boolean).join('\n')
  return askModel([{ text }], GENERATE_SYSTEM)
}

export const handler: Schema['importRecipe']['functionHandler'] = async (event) => {
  const { url, photoKey, idea, tools, servings } = event.arguments
  if (url) return fromUrl(url)
  if (photoKey) return fromPhoto(photoKey)
  if (idea?.trim()) return generate(idea, (tools ?? []).filter((t): t is string => !!t), servings)
  throw new Error('Trimite un link, o poză sau o idee de rețetă.')
}
