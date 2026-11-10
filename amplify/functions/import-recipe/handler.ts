import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, type ContentBlock, type ImageFormat } from '@aws-sdk/client-bedrock-runtime'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Schema } from '../../data/resource'
import { safeFetch } from '../../shared/safeFetch'
import { fileSpace, newFilePath } from '../../shared/files'
import { spaceOf } from '../../shared/spaces'
import { VIDEO_RULES, videoSource, videoText } from './video'
import { runJob } from '../../shared/jobResult'
import { countAi } from '../../shared/aiUsage'

const bedrock = new BedrockRuntimeClient({})
const s3 = new S3Client({})

const BUCKET = process.env.KITCHEN_TALES_FILES_BUCKET_NAME!
// The caller's space, set per call by the handler: new photos go in its folder (shared/files.ts).
let callerSpace: string | undefined
const MODEL_ID = process.env.MODEL_ID!
// Text-to-image models are only offered in us-west-2 on this account's Bedrock.
const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID!
const imageBedrock = new BedrockRuntimeClient({ region: process.env.IMAGE_MODEL_REGION })

const CATEGORIES = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']
const MAX_PAGE_BYTES = 3_000_000
const MAX_TEXT_CHARS = 40_000

// What can be in a dish that a family may avoid: the 14 allergens food labels must show in the
// EU, plus pork and meat (for families that don't eat them). Keys match src/lib/diet.ts.
const ALLERGENS: Record<string, string> = {
  gluten: 'gluten (grâu, secară, orz, ovăz, paste, pâine, făină obișnuită)', crustacee: 'crustacee', oua: 'ouă',
  peste: 'pește', arahide: 'arahide', soia: 'soia', lactoza: 'lapte și lactate (lactoză)', nuci: 'nuci și fructe cu coajă (migdale, alune, caju, fistic)',
  telina: 'țelină', mustar: 'muștar', susan: 'susan', sulfiti: 'sulfiți (vin, fructe uscate)', lupin: 'lupin', moluste: 'moluște',
  porc: 'carne de porc (inclusiv bacon, șuncă, slănină, cârnați de porc)', carne: 'orice carne sau pește',
}
const FACT_PROPS = {
  nutrition: {
    type: 'object',
    description: 'Valori estimate pentru O porție, din ingrediente și numărul de porții.',
    properties: {
      kcal: { type: 'integer' }, protein: { type: 'number', description: 'grame' }, carbs: { type: 'number', description: 'grame' },
      fat: { type: 'number', description: 'grame' }, fiber: { type: 'number', description: 'grame' }, sugar: { type: 'number', description: 'grame' },
      salt: { type: 'number', description: 'grame' },
    },
    required: ['kcal', 'protein', 'carbs', 'fat'],
  },
  allergens: {
    type: 'array',
    description: 'Ce conține rețeta din lista de chei, fiecare cu ingredientele din care vine (cum apar în rețetă, scurt).',
    items: {
      type: 'object',
      properties: { key: { type: 'string', enum: Object.keys(ALLERGENS) }, from: { type: 'array', items: { type: 'string' } } },
      required: ['key', 'from'],
    },
  },
}
const FACT_RULES = `
- nutrition: estimează realist valorile pentru o porție (folosește cantitățile și numărul de porții; dacă porțiile lipsesc, presupune 4).
- allergens: marchează tot ce conține rețeta din aceste chei: ${Object.entries(ALLERGENS).map(([k, v]) => `${k} = ${v}`).join('; ')}. Fii atent la ingrediente ascunse (pesmet = gluten, unt = lactoză, maioneză = ouă, sos de soia = soia și gluten).`

type Facts = { nutrition?: Record<string, number>; allergens?: { key: string; from?: string[] }[] }
/** The facts as the JSON strings stored on the recipe row. */
function factsJson(f: Facts) {
  const n = f.nutrition && typeof f.nutrition.kcal === 'number' ? f.nutrition : undefined
  const al = (f.allergens ?? []).filter((x) => x && x.key in ALLERGENS).map((x) => ({ key: x.key, from: (x.from ?? []).filter(Boolean).slice(0, 6) }))
  return { nutrition: n ? JSON.stringify(n) : undefined, allergens: n ? JSON.stringify(al) : undefined }
}

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
  nutrition?: string
  allergens?: string
}

const SYSTEM = `Extragi rețete culinare din pagini web sau din fotografii (text tipărit sau scris de mână).
Răspunde întotdeauna apelând unealta save_recipe.
Reguli:
- Scrie totul în limba română, cu diacritice. Dacă sursa e în altă limbă, traduce natural.
- Păstrează cantitățile exact; convertește unitățile imperiale în metrice (g, ml, °C).
- Un ingredient pe element, de forma „500 g făină”. Un pas pe element, fără numerotare.
- Categoria trebuie să fie una dintre: ${CATEGORIES.join(', ')}.
- Nu inventa. Ce nu apare în sursă rămâne gol.
- Dacă sursa nu conține o rețetă, pune title = "" și listele goale.${FACT_RULES}`

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
          ...FACT_PROPS,
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
  const input = (block?.toolUse?.input ?? {}) as Partial<Imported> & Facts
  return {
    ...factsJson(input),
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
    const res = await safeFetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return undefined
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > 8_000_000) return undefined
    // Only real photos, recognised by their bytes (no SVG, which can carry scripts, or HTML).
    const format = imageFormat(body)
    if (!format) return undefined
    const type = `image/${format}`
    const ext = format === 'jpeg' ? 'jpg' : format
    const key = newFilePath('recipe-photos', callerSpace, ext)
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: type }))
    return key
  } catch {
    return undefined
  }
}

async function fromVideo(raw: string): Promise<Imported | undefined> {
  const v = await videoText(raw)
  if (!v) return undefined
  const recipe = await askModel([{ text: videoSource(v) }], SYSTEM + '\n' + VIDEO_RULES)
  if (!recipe.title || !recipe.ingredients.length) {
    throw new Error('Nu am găsit rețeta în textul videoclipului. Dacă e doar spusă în video, dictează-o sau lipește-o aici.')
  }
  // The video's still: YouTube's big one when there is one, else the one the platform gave.
  const stills = v.platform === 'youtube' && v.thumbnail ? [v.thumbnail.replace('hqdefault', 'maxresdefault'), v.thumbnail] : v.thumbnail ? [v.thumbnail] : []
  let photoKey: string | undefined
  for (const s of stills) if (!photoKey) photoKey = await savePhotoFrom(s)
  return { ...recipe, sourceUrl: v.url, photoKey }
}

async function fromUrl(raw: string): Promise<Imported> {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Linkul trebuie să înceapă cu http:// sau https://')
  const video = await fromVideo(url.toString())
  if (video) return video
  const res = await safeFetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (KitchenTales recipe import)', 'Accept-Language': 'ro,en;q=0.8' },
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

const MAX_PHOTOS = 4

async function photoBlock(key: string): Promise<ContentBlock> {
  // Only a photo the caller just uploaded to its own space folder, never another space's file.
  if (!callerSpace || fileSpace(key) !== callerSpace || !key.startsWith('recipe-photos/')) throw new Error('Poză invalidă')
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const bytes = await obj.Body!.transformToByteArray()
  const fmt = imageFormat(bytes)
  if (!fmt) throw new Error('Formatul pozei nu e suportat. Folosește JPG, PNG, WEBP sau GIF.')
  return { image: { format: fmt, source: { bytes } } }
}

/** One recipe from one or more photos (pages of a book, both sides of a note), read together in order. */
async function fromPhotos(keys: string[]): Promise<Imported> {
  if (keys.length > MAX_PHOTOS) throw new Error(`Cel mult ${MAX_PHOTOS} poze pentru o rețetă.`)
  const images = await Promise.all(keys.map(photoBlock))
  return askModel([
    ...images,
    { text: keys.length > 1
      ? `Acestea sunt ${keys.length} fotografii ale ACELEIAȘI rețete, în ordine (de exemplu două pagini din carte sau fața și spatele unui bilet). Citește-le împreună și extrage o singură rețetă completă, fără să repeți ce apare de două ori.`
      : 'Extrage rețeta din această fotografie.' },
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
- Dacă cererea nu e despre mâncare, pune title = "" și listele goale.
- Respectă restricțiile familiei, dacă sunt date: ce e „alergie” nu apare deloc, nici ca urmă (verifică și ingredientele ascunse);
  ce e „evităm” înlocuiești cu ceva potrivit; ce nu le place lași deoparte. În notes spune pe scurt ce ai înlocuit.${FACT_RULES}`

const MAX_IDEA_CHARS = 2000
const MAX_TOOLS = 30

const MAX_DIET_CHARS = 1000
const dietLine = (diet?: string | null) => (diet?.trim() ? `Restricțiile familiei: ${diet.trim().slice(0, MAX_DIET_CHARS)}` : '')

function generate(idea: string, tools: (string | null)[], servings?: number | null, diet?: string | null): Promise<Imported> {
  const list = cleanTools(tools)
  const text = [
    `Cererea: ${idea.trim().slice(0, MAX_IDEA_CHARS)}`,
    `Aparatele familiei: ${list.length ? list.join(', ') : 'doar ustensilele de bază'}.`,
    servings ? `Porții: ${servings}.` : '',
    dietLine(diet),
  ].filter(Boolean).join('\n')
  return askModel([{ text }], GENERATE_SYSTEM)
}

// ---- adapting a saved recipe to the family's diet ----

const ADAPT_SYSTEM = GENERATE_SYSTEM + `
Primești o rețetă existentă și restricțiile familiei. Rescrie-o ca să le respecte: înlocuiește doar ce trebuie,
păstrează felul de mâncare, titlul (adaugă la final de exemplu „, fără lactoză”), porțiile și pașii, cu cantitățile potrivite pentru înlocuitori.
În notes scrie ce ai înlocuit, de forma „smântână → iaurt grecesc fără lactoză”.`

function adapt(recipeJson: string, diet: string, tools: (string | null)[]): Promise<Imported> {
  let r: Partial<Imported> = {}
  try { r = JSON.parse(recipeJson.slice(0, MAX_FREE_TEXT_CHARS)) } catch { throw new Error('Rețeta nu a putut fi citită.') }
  const list = cleanTools(tools)
  const text = [
    `Rețeta: ${r.title ?? ''}${r.servings ? ` (${r.servings} porții)` : ''}`,
    `Ingrediente:\n${(r.ingredients ?? []).join('\n')}`,
    `Pași:\n${(r.steps ?? []).join('\n')}`,
    r.notes ? `Note: ${r.notes}` : '',
    `Aparatele familiei: ${list.length ? list.join(', ') : 'doar ustensilele de bază'}.`,
    dietLine(diet),
  ].filter(Boolean).join('\n\n')
  return askModel([{ text }], ADAPT_SYSTEM)
}

// ---- values and allergens of a saved recipe ----

const FACTS_TOOL = {
  toolSpec: {
    name: 'save_facts',
    description: 'Salvează valorile nutriționale și alergenii.',
    inputSchema: { json: { type: 'object', properties: FACT_PROPS, required: ['nutrition', 'allergens'] } },
  },
}

async function analyze(title: string, servings: number | null | undefined, ingredients: string[]) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: `Ești nutriționist. Pentru rețeta dată estimezi valorile nutriționale pe porție și alergenii. Răspunde apelând unealta save_facts.${FACT_RULES}` }],
    messages: [{ role: 'user', content: [{ text: `Rețeta: ${title.slice(0, 200)}\nPorții: ${servings || 'nespecificat'}\nIngrediente:\n${ingredients.slice(0, 60).join('\n').slice(0, MAX_FREE_TEXT_CHARS)}` }] }],
    toolConfig: { tools: [FACTS_TOOL], toolChoice: { tool: { name: 'save_facts' } } },
    inferenceConfig: { maxTokens: 1200 },
  }))
  const block = res.output?.message?.content?.find((c) => c.toolUse)
  return factsJson((block?.toolUse?.input ?? {}) as Facts)
}

// ---- ideas from the fridge ----

type Idea = { title: string; description?: string; tools?: string[]; missing?: string[]; minutes?: number; kcal?: number; swaps?: string[] }

const SUGGEST_SYSTEM = `Ești un bucătar care ajută o familie din România să gătească din ce are în frigider.
Răspunde întotdeauna apelând unealta suggest_recipes.
Reguli:
- Propune 4 feluri de mâncare diferite (de exemplu o supă, un fel principal, ceva rapid, ceva pentru copii), toate în română, cu diacritice.
- Folosește în principal ingredientele date. Presupune că familia are sare, piper, ulei, apă, zahăr și făină.
- În missing pune doar ce ar mai trebui cumpărat (cel mult 3 lucruri); listă goală dacă nu lipsește nimic. Preferă rețete fără ingrediente lipsă.
- Folosește DOAR ustensilele de bază (aragaz, cuptor, cratițe, tigaie) și aparatele familiei. În tools pune aparatele familiei pe care le folosește rețeta.
- description: o frază scurtă și apetisantă.
- kcal: estimarea caloriilor pe o porție.
- Respectă restricțiile familiei, dacă sunt date: ce e „alergie” nu apare deloc (nici ca urmă); ce e „evităm” înlocuiești
  (în swaps scrie de forma „iaurt fără lactoză în loc de smântână”), chiar dacă e în frigider; ce nu le place lași deoparte.`

const SUGGEST_TOOL = {
  toolSpec: {
    name: 'suggest_recipes',
    description: 'Propune rețete.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                tools: { type: 'array', items: { type: 'string' } },
                missing: { type: 'array', items: { type: 'string' } },
                minutes: { type: 'integer', description: 'Timp total, în minute' },
                kcal: { type: 'integer', description: 'Calorii pe porție, estimat' },
                swaps: { type: 'array', items: { type: 'string' }, description: 'Ce ai înlocuit ca să respecți restricțiile' },
              },
              required: ['title', 'description', 'missing'],
            },
          },
        },
        required: ['ideas'],
      },
    },
  },
}

const cleanTools = (tools: (string | null)[] | null | undefined) =>
  (tools ?? []).filter((t): t is string => !!t).map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, MAX_TOOLS)

async function suggest(ingredients: string, tools: string[], diet?: string | null): Promise<Idea[]> {
  const text = [
    `Ce am în frigider: ${ingredients.trim().slice(0, MAX_IDEA_CHARS)}`,
    `Aparatele familiei: ${tools.length ? tools.join(', ') : 'doar ustensilele de bază'}.`,
    dietLine(diet),
  ].filter(Boolean).join('\n')
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: SUGGEST_SYSTEM }],
    messages: [{ role: 'user', content: [{ text }] }],
    toolConfig: { tools: [SUGGEST_TOOL], toolChoice: { tool: { name: 'suggest_recipes' } } },
    inferenceConfig: { maxTokens: 2000 },
  }))
  const block = res.output?.message?.content?.find((c) => c.toolUse)
  const ideas = ((block?.toolUse?.input as { ideas?: Idea[] } | undefined)?.ideas ?? [])
  return ideas.filter((i) => i?.title?.trim()).slice(0, 6)
}

// ---- planning the week's dinners ----

type PlanDay = { day: string; label: string; minutes?: number | null }
type PlanRecipe = { id: string; title: string; category?: string; minutes?: number; ingredients?: string[]; favorite?: boolean; cooked?: number; lastCooked?: string }
type PlanArgs = {
  days: string; recipes?: string | null; recent?: (string | null)[] | null; fridge?: string | null; diet?: string | null
  tools?: (string | null)[] | null; allowNew?: boolean | null; swapDay?: string | null; keep?: (string | null)[] | null
}
type Planned = { day: string; kind: 'existing' | 'new' | 'leftovers'; recipeId?: string; title: string; reason?: string; recipe?: Imported }
const MAX_NEW = 2

const PLAN_SYSTEM = `Ești bucătarul unei familii din România și le planifici cinele pe câteva seri.
Răspunde apelând unealta plan_week, cu exact o intrare pentru fiecare seară cerută, în ordine.
Reguli:
- Pentru fiecare seară, rețeta trebuie să încapă în timpul disponibil (minutes; lipsă = oricât).
- Preferă rețetele familiei (kind = existing, cu recipeId exact din listă), mai ales cele marcate ♥ (preferate) și pe cele bune
  care n-au mai fost gătite de mult (ultima dată). Dacă ai voie la rețete noi (allowNew), poți propune
  cel mult 2 rețete noi (kind = new, cu un titlu clar și scurt), când lipsește varietate sau nimic nu încape în timp.
- Varietate: nu repeta același fel principal (pui, porc, vită, pește, paste, supă, vegetarian) în seri la rând; nu propune ce au gătit recent.
- Folosește întâi ce e în frigider, mai ales ce se strică repede, și spune asta în reason.
- O ciorbă sau o mâncare mare poate acoperi și seara următoare: atunci pune pentru seara următoare kind = leftovers, title = „Resturi: <fel>”.
  Fă asta cel mult o dată și doar când seara următoare are puțin timp.
- Respectă restricțiile familiei: ce e alergie nu apare deloc; ce evită nu alegi.
- reason: o frază foarte scurtă, de ce această rețetă în seara asta („folosește dovleceii”, „rapidă, ai 20 de minute”).`

const PLAN_TOOL = {
  toolSpec: {
    name: 'plan_week',
    description: 'Salvează planul de cine.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string', description: 'Data serii, exact ca în cerere (YYYY-MM-DD)' },
                kind: { type: 'string', enum: ['existing', 'new', 'leftovers'] },
                recipeId: { type: 'string' },
                title: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['day', 'kind', 'title'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
}

async function planWeek(a: PlanArgs): Promise<Planned[]> {
  let days: PlanDay[] = []
  let recipes: PlanRecipe[] = []
  try { days = JSON.parse(a.days) } catch { throw new Error('Zilele nu au putut fi citite.') }
  try { recipes = a.recipes ? JSON.parse(a.recipes) : [] } catch { recipes = [] }
  days = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)).slice(0, 7)
  if (a.swapDay) days = days.filter((d) => d.day === a.swapDay)
  if (!days.length) throw new Error('Alege cel puțin o seară.')
  recipes = recipes.slice(0, 150)
  const ids = new Set(recipes.map((r) => r.id))
  const keep = (a.keep ?? []).filter(Boolean) as string[]
  const tools = cleanTools(a.tools)
  const text = [
    `Serile de planificat: ${days.map((d) => `${d.day} (${d.label}): ${d.minutes ? `${d.minutes} minute` : 'oricât'}`).join('; ')}`,
    `Rețetele familiei (id | titlu | categorie | minute | ingrediente principale | ♥ preferată, de câte ori și ultima dată gătită):\n${recipes.map((r) => `${r.id} | ${r.title} | ${r.category ?? ''} | ${r.minutes ?? '?'} | ${(r.ingredients ?? []).slice(0, 8).join(', ')} | ${[r.favorite ? '♥' : '', r.cooked ? `${r.cooked}x, ultima dată ${r.lastCooked ?? '?'}` : ''].filter(Boolean).join(' ')}`).join('\n') || '(niciuna)'}`,
    a.recent?.length ? `Gătite recent (nu le repeta): ${a.recent.filter(Boolean).join(', ')}` : '',
    keep.length ? `Restul săptămânii are deja: ${keep.join(', ')} (alege altceva, diferit de acestea).` : '',
    a.fridge?.trim() ? `Ce e în frigider: ${a.fridge.trim().slice(0, MAX_IDEA_CHARS)}` : '',
    `Rețete noi permise: ${a.allowNew ? 'da (cel mult 2)' : 'nu, doar din lista familiei'}.`,
    dietLine(a.diet),
  ].filter(Boolean).join('\n\n')
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: PLAN_SYSTEM }],
    messages: [{ role: 'user', content: [{ text }] }],
    toolConfig: { tools: [PLAN_TOOL], toolChoice: { tool: { name: 'plan_week' } } },
    inferenceConfig: { maxTokens: 2000 },
  }))
  const block = res.output?.message?.content?.find((c) => c.toolUse)
  const raw = ((block?.toolUse?.input as { items?: Planned[] } | undefined)?.items ?? [])
  const byDay = new Map(raw.filter((x) => x?.day).map((x) => [x.day, x]))
  const items: Planned[] = days.map((d) => {
    const x = byDay.get(d.day)
    if (!x) return { day: d.day, kind: (a.allowNew ? 'new' : 'existing') as Planned['kind'], title: 'O cină rapidă', reason: '' }
    if (x.kind === 'existing' && (!x.recipeId || !ids.has(x.recipeId))) return { ...x, kind: (a.allowNew ? 'new' : 'existing') as Planned['kind'], recipeId: undefined }
    if (x.kind === 'new' && !a.allowNew) return { ...x, kind: 'existing' as const }
    return { ...x, day: d.day }
  }).filter((x) => x.kind !== 'existing' || x.recipeId)
  // The new dishes are written in full (in parallel), like "Generează", for the time of their evening.
  // At most 2, whatever the model answered: each one is a full recipe to write (time and cost).
  const toWrite = new Set(items.filter((x) => x.kind === 'new').slice(0, MAX_NEW))
  await Promise.all(items.map(async (x) => {
    if (!toWrite.has(x)) return
    const d = days.find((y) => y.day === x.day)
    const idea = `${x.title}. Cină pentru seara de ${d?.label ?? ''}, gata în ${d?.minutes ? `cel mult ${d.minutes} de minute` : 'cât e nevoie'}.` +
      (a.fridge?.trim() ? ` Folosește dacă se potrivește: ${a.fridge.trim().slice(0, 500)}.` : '')
    x.recipe = await generate(idea, tools, 4, a.diet).catch(() => undefined)
    if (x.recipe?.title) x.title = x.recipe.title
  }))
  return items.filter((x) => x.kind !== 'new' || x.recipe?.title)
}

// Amplify Gen2 sends fieldName at the top level of the event (no AppSync-style `info`).
// AI photo for a recipe that has none: Claude writes an English food-photo prompt from the
// Romanian recipe, Stable Image Core draws it, and the JPEG goes to recipe-photos/.
async function imagePrompt(title: string, ingredients: string[]): Promise<string> {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: 'You write one-sentence English prompts for realistic food photography. Describe only the finished dish as it is served, its look, the plate or pot, and a warm home-kitchen setting. No text, no people, no hands. Reply with the prompt only.' }],
    messages: [{ role: 'user', content: [{ text: `Recipe (Romanian): ${title}\nIngredients: ${ingredients.slice(0, 15).join('; ')}` }] }],
    inferenceConfig: { maxTokens: 200, temperature: 0.4 },
  }))
  const text = res.output?.message?.content?.find((c) => c.text)?.text?.trim()
  return text || `A homemade dish: ${title}`
}

async function generatePhoto(title: string, ingredients: string[]): Promise<string> {
  if (!title.trim()) throw new Error('Rețeta nu are titlu.')
  const prompt = await imagePrompt(title, ingredients)
  const res = await imageBedrock.send(new InvokeModelCommand({
    modelId: IMAGE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      prompt: `${prompt} Professional food photography, natural window light, shallow depth of field, appetizing.`,
      negative_prompt: 'text, letters, watermark, logo, people, hands, cartoon, illustration',
      aspect_ratio: '3:2',
      output_format: 'jpeg',
    }),
  })).catch((err: Error) => {
    // The image model is sold through AWS Marketplace: it needs an active subscription and a valid card.
    if (err.name === 'AccessDeniedException') throw new Error('Modelul de imagini nu e activ în contul AWS (abonament Marketplace sau card de plată).')
    throw err
  })
  const out = JSON.parse(new TextDecoder().decode(res.body)) as { images?: string[]; finish_reasons?: (string | null)[] }
  const b64 = out.images?.[0]
  if (!b64 || out.finish_reasons?.[0]) throw new Error('Nu am putut genera poza. Încearcă din nou.')
  const key = newFilePath('recipe-photos', callerSpace, 'jpg')
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from(b64, 'base64'), ContentType: 'image/jpeg' }))
  return key
}

type PhotoEvent = { fieldName?: string; info?: { fieldName?: string }; arguments: { title: string; ingredients?: (string | null)[] | null } }

type SuggestEvent = { fieldName?: string; info?: { fieldName?: string }; arguments: { ingredients: string; tools?: (string | null)[] | null; diet?: string | null } }
type AnalyzeEvent = { fieldName?: string; info?: { fieldName?: string }; arguments: { title: string; servings?: number | null; ingredients: (string | null)[] } }

// ---- free text (typed, pasted or dictated) ----

const TEXT_RULES = `
Textul vine dintr-un mesaj, o notiță sau a fost dictat cu vocea, deci poate fi neformatat și fără punctuație:
- Numerele spuse în cuvinte devin cifre, cu unități metrice: „două sute de grame de făină” devine „200 g făină”, „o linguriță de sare” devine „1 linguriță sare”.
- Ignoră cuvintele de umplutură („deci”, „păi”, „ăă”, „bun”) și urmează corecturile vorbitorului: „trei ouă, nu, de fapt patru” înseamnă 4 ouă.
- Separă ingredientele de pași chiar dacă sunt amestecate. Un ingredient pomenit doar în pași intră și în lista de ingrediente (fără cantitate, dacă nu a fost spusă).
- Corectează un cuvânt recunoscut greșit doar când sensul culinar e evident.
- Dacă nu e spus un titlu, alege unul scurt pentru preparat (aici ai voie să completezi).`
const MAX_FREE_TEXT_CHARS = 20_000

function fromText(text: string): Promise<Imported> {
  return askModel([{ text: `Textul rețetei:\n${text.trim().slice(0, MAX_FREE_TEXT_CHARS)}` }], SYSTEM + '\n' + TEXT_RULES)
}

type ImportArgs = Schema['importRecipe']['args']

async function importFrom(args: ImportArgs): Promise<Imported> {
  const { url, photoKey, photoKeys, text, idea, tools, servings, diet, adaptFrom } = args
  if (adaptFrom) {
    if (!diet?.trim()) throw new Error('Nu e setat ce nu mănâncă familia.')
    return adapt(adaptFrom, diet, tools ?? [])
  }
  if (url) return fromUrl(url)
  const keys = (photoKeys ?? []).filter((k): k is string => !!k)
  if (keys.length) return fromPhotos(keys)
  if (photoKey) return fromPhotos([photoKey])
  if (text?.trim()) return fromText(text)
  if (idea?.trim()) return generate(idea, tools ?? [], servings, diet)
  throw new Error('Trimite un link, o poză, un text sau o idee de rețetă.')
}

function suggestFrom({ ingredients, tools, diet }: SuggestEvent['arguments']) {
  if (!ingredients?.trim()) throw new Error('Scrie ce ai în frigider.')
  return suggest(ingredients, cleanTools(tools), diet)
}

type JobEvent = { fieldName?: string; arguments: Record<string, unknown> & { jobId?: string | null }; identity?: { groups?: string[] | null } | null }

/**
 * The async mutations (startImportRecipe, startSuggestRecipes, startPlanWeek): the same work as the
 * queries, run in the background, with the outcome written for the app (amplify/shared/jobs.ts).
 */
async function background(field: string, e: JobEvent) {
  const args = e.arguments
  await runJob(s3, BUCKET, e, async () => {
    await countAi(s3, BUCKET, callerSpace, 'recipe')
    if (field === 'startImportRecipe') {
      const r = await importFrom(args as unknown as ImportArgs)
      if (!r.title) throw new Error('Nu am găsit o rețetă aici.')
      return r
    }
    if (field === 'startSuggestRecipes') return suggestFrom(args as unknown as SuggestEvent['arguments'])
    return planWeek(args as unknown as PlanArgs)
  })
  return { success: true }
}

const JOBS = new Set(['startImportRecipe', 'startSuggestRecipes', 'startPlanWeek'])

// One function serves importRecipe, suggestRecipes, analyzeRecipe, planWeek and generateRecipePhoto,
// and their async versions (start…).
export const handler = async (event: { arguments: ImportArgs } | SuggestEvent) => {
  const e = event as SuggestEvent
  callerSpace = spaceOf((event as { identity?: { groups?: string[] | null } }).identity?.groups)
  const field = e.fieldName ?? e.info?.fieldName
  if (field && JOBS.has(field)) return background(field, event as unknown as JobEvent)
  // Everything below calls Claude or draws a photo: counted against the space's monthly limit.
  await countAi(s3, BUCKET, callerSpace, field === 'generateRecipePhoto' ? 'photo' : 'recipe')
  if (field === 'generateRecipePhoto') {
    const { title, ingredients } = (event as unknown as PhotoEvent).arguments
    return generatePhoto(title ?? '', (ingredients ?? []).filter((x): x is string => !!x?.trim()))
  }
  if (field === 'planWeek') return JSON.stringify(await planWeek((event as unknown as { arguments: PlanArgs }).arguments))
  if (field === 'analyzeRecipe') {
    const { title, servings, ingredients } = (event as unknown as AnalyzeEvent).arguments
    const list = (ingredients ?? []).filter((x): x is string => !!x?.trim())
    if (!list.length) throw new Error('Rețeta nu are ingrediente.')
    return analyze(title ?? '', servings, list)
  }
  if (field === 'suggestRecipes' || (!field && 'ingredients' in (e.arguments ?? {}))) return suggestFrom((event as SuggestEvent).arguments)
  return importFrom((event as { arguments: ImportArgs }).arguments)
}
