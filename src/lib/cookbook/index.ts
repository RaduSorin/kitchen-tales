// The cookbook on the phone: picks the recipes, gathers the fonts and photos and hands them to the
// PDF layout (./pdf.ts). Everything happens on the device, from recipes and photos it already has,
// so it also works offline and costs nothing on AWS. Loaded only when the export sheet opens.

import { photoBlob } from '../useFileUrl'
import type { Recipe, RecipeLog } from '../types'
import { buildCookbook, type CookbookFonts, type CookbookPhoto, type CookbookRecipe, type CookbookStyle } from './pdf'

export type { CookbookStyle }

const FONT_FILES: Record<keyof CookbookFonts, string> = {
  serif: 'fraunces-600', serifItalic: 'fraunces-600-italic', sans: 'figtree-400', sansBold: 'figtree-700', sansBlack: 'figtree-800',
}

let fonts: Promise<CookbookFonts> | undefined
function loadFonts() {
  fonts ??= Promise.all(Object.entries(FONT_FILES).map(async ([k, f]) => {
    const res = await fetch(`${import.meta.env.BASE_URL}fonts/pdf/${f}.ttf`)
    if (!res.ok) throw new Error(`font ${f} ${res.status}`)
    return [k, new Uint8Array(await res.arrayBuffer())] as const
  })).then((e) => Object.fromEntries(e) as CookbookFonts)
  fonts.catch(() => { fonts = undefined })
  return fonts
}

/** The photo as a JPEG at most `max` pixels wide or tall, which keeps the PDF small enough to send. */
async function toJpeg(blob: Blob, max = 1400): Promise<CookbookPhoto> {
  const img = await createImageBitmap(blob)
  const s = Math.min(1, max / Math.max(img.width, img.height))
  const width = Math.round(img.width * s), height = Math.round(img.height * s)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  img.close()
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('jpeg'))), 'image/jpeg', 0.82))
  return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), width, height }
}

export interface CookbookOptions {
  recipes: Recipe[]
  logs: Map<string, RecipeLog>
  style: CookbookStyle
  photos: boolean
  authors?: string
  onProgress?: (done: number, total: number, title: string) => void
}

export async function makeCookbook(o: CookbookOptions): Promise<{ file: File; pages: number }> {
  const font = loadFonts()
  const items: CookbookRecipe[] = []
  // Photos first (the slow part, counted as the first half of the progress), then the pages.
  const total = o.recipes.length
  for (const [i, recipe] of o.recipes.entries()) {
    o.onProgress?.(i, total * 2, recipe.title)
    const log = o.logs.get(recipe.id)
    let photo: CookbookPhoto | undefined
    if (o.photos && recipe.photoKey) photo = await photoBlob(recipe.photoKey).then((b) => toJpeg(b)).catch(() => undefined)
    items.push({ recipe, favorite: !!log?.favorite, cooked: log?.cooked.length ?? 0, notes: log?.notes ?? [], photo })
  }
  const { bytes, pages } = await buildCookbook({
    recipes: items, style: o.style, fonts: await font, authors: o.authors, date: new Date(),
    onProgress: (done, n, title) => o.onProgress?.(total + Math.round((done / Math.max(1, n)) * total), total * 2, title),
  })
  const file = new File([bytes as BlobPart], 'Rețetele noastre.pdf', { type: 'application/pdf' })
  return { file, pages }
}

/** A rough page count and size for the sheet, before anything is made. */
export function estimate(recipes: Recipe[], photos: boolean) {
  const withPhoto = photos ? recipes.filter((r) => r.photoKey).length : 0
  const long = recipes.filter((r) => r.ingredients.length > 14 || r.steps.join(' ').length > 700).length
  const pages = 1 + Math.max(1, Math.ceil((recipes.length + 8) / 28)) + recipes.length + long
  const mb = 0.25 + withPhoto * 0.2
  return { pages, mb: mb < 1 ? Math.round(mb * 10) / 10 : Math.round(mb) }
}
