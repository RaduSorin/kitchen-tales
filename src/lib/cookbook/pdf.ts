// The family cookbook as an A4 PDF: a cover, contents by category (each line links to its page) and
// one page or more per recipe. Pure layout: the fonts and photos come in as bytes, so the same code
// runs on the phone (src/lib/cookbook/index.ts) and in the tests.

import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument, PDFName, PDFArray, PDFNull, clip, concatTransformationMatrix, drawObject, endPath, popGraphicsState,
  pushGraphicsState, rectangle, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage, type PDFRef, type RGB,
} from 'pdf-lib'
import { isHeading } from '../scale'
import type { CookNote, Recipe } from '../types'

export type CookbookStyle = 'classic' | 'evening'

export type FontName = 'serif' | 'serifItalic' | 'sans' | 'sansBold' | 'sansBlack'
/** TTF bytes for each face (public/fonts/pdf/). */
export type CookbookFonts = Record<FontName, Uint8Array>

/** A photo ready for the PDF: JPEG bytes and its size in pixels. */
export interface CookbookPhoto { jpeg: Uint8Array; width: number; height: number }

export interface CookbookRecipe {
  recipe: Recipe
  favorite: boolean
  /** How many times the family cooked it. */
  cooked: number
  /** Notes written after cooking, newest last. */
  notes: CookNote[]
  photo?: CookbookPhoto
}

export interface CookbookInput {
  recipes: CookbookRecipe[]
  style: CookbookStyle
  fonts: CookbookFonts
  /** "Sorin și Loredana", under the title on the cover. */
  authors?: string
  /** Shown as the month on the cover, e.g. new Date(). */
  date: Date
  onProgress?: (done: number, total: number, title: string) => void
}

// A4 in points.
const W = 595.28
const H = 841.89
const M = 48 // side margin
const FOOT = 40 // bottom area for the folio

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

interface Theme {
  page?: RGB; ink: RGB; soft: RGB; muted: RGB; gold: RGB; rule: RGB; box: RGB; boxEdge: RGB; stepDisc: RGB; stepNum: RGB; heart: RGB
}
const THEMES: Record<CookbookStyle, Theme> = {
  classic: {
    page: hex('#fbf7ef'), ink: hex('#2a231d'), soft: hex('#5d4c37'), muted: hex('#8b7a63'), gold: hex('#a8792a'),
    rule: hex('#d9c9a8'), box: hex('#f3ead7'), boxEdge: hex('#c9a35a'), stepDisc: hex('#f1e4c6'), stepNum: hex('#7a561c'), heart: hex('#c0504d'),
  },
  evening: {
    page: hex('#14110f'), ink: hex('#f4efe6'), soft: hex('#e7dfd3'), muted: hex('#a49b91'), gold: hex('#f2c879'),
    rule: hex('#3a332d'), box: hex('#221d1a'), boxEdge: hex('#f2c879'), stepDisc: hex('#3a3122'), stepNum: hex('#f2c879'), heart: hex('#e0736a'),
  },
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const OTHER = 'Altele'

/** "1 rețetă", "5 rețete", "24 de rețete" (Romanian puts "de" before 20 and up). */
export const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? `de ${many}` : many}`

/** The editor's suggested categories (src/pages/RecipeEdit.tsx), in the order the book uses. */
const ORDER = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']
const rank = (c: string) => { const i = ORDER.indexOf(c); return i < 0 ? (c === OTHER ? ORDER.length + 1 : ORDER.length) : i }

/** Recipes by category: the editor's categories first, then the others alphabetically, "Altele" last. */
export function byCategory(list: CookbookRecipe[]) {
  const groups = new Map<string, CookbookRecipe[]>()
  for (const r of list) {
    const c = r.recipe.category?.trim() || OTHER
    groups.set(c, [...(groups.get(c) ?? []), r])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'ro'))
    .map(([category, items]) => ({ category, items: items.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'ro')) }))
}

/** Words of `text` in lines no wider than `width`; a word longer than the line is cut. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) out.push(line)
      let w = word
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let n = w.length - 1
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--
        out.push(w.slice(0, n))
        w = w.slice(n)
      }
      line = w
    }
    out.push(line)
  }
  return out
}

/** Keeps only the characters the fonts can draw (emoji and the like are dropped). */
const printable = (s: string) => s.replace(/[^ -~ -ſȘ-ț–—‘-„•…€]/g, '').replace(/\s+/g, ' ').trim()

const romanianDate = (day: string) => {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export async function buildCookbook(input: CookbookInput): Promise<{ bytes: Uint8Array; pages: number }> {
  const t = THEMES[input.style]
  const dark = input.style === 'evening'
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle('Rețetele noastre')
  doc.setCreator('Bucătăria cu povești')
  doc.setLanguage('ro-RO')
  const embed = (n: FontName) => doc.embedFont(input.fonts[n], { subset: true })
  const [serif, serifItalic, sans, sansBold, sansBlack] = await Promise.all(
    (['serif', 'serifItalic', 'sans', 'sansBold', 'sansBlack'] as const).map(embed),
  )

  const groups = byCategory(input.recipes)
  const all = groups.flatMap((g) => g.items)
  const images = new Map<CookbookRecipe, PDFImage>()
  for (const r of all) if (r.photo) images.set(r, await doc.embedJpg(r.photo.jpeg))

  // ---- drawing helpers ----
  const newPage = () => {
    const p = doc.addPage([W, H])
    if (t.page) p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.page })
    return p
  }
  const text = (p: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color: RGB, spacing = 0) => {
    if (spacing) p.pushOperators(setCharacterSpacing(spacing))
    p.drawText(s, { x, y, font, size, color })
    if (spacing) p.pushOperators(setCharacterSpacing(0))
  }
  const spacedWidth = (s: string, font: PDFFont, size: number, spacing: number) => font.widthOfTextAtSize(s, size) + spacing * Math.max(0, s.length - 1)
  const centered = (p: PDFPage, s: string, y: number, font: PDFFont, size: number, color: RGB, spacing = 0) =>
    text(p, s, (W - spacedWidth(s, font, size, spacing)) / 2, y, font, size, color, spacing)
  const kicker = (p: PDFPage, s: string, x: number, y: number, center = false) => {
    const up = s.toLocaleUpperCase('ro')
    if (center) centered(p, up, y, sansBlack, 8, t.gold, 1.8)
    else text(p, up, x, y, sansBlack, 8, t.gold, 1.6)
  }
  /** Draws `img` filling the box (cropped to it, like CSS background-size: cover). */
  const cover = (p: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) => {
    const s = Math.max(w / img.width, h / img.height)
    const dw = img.width * s, dh = img.height * s
    p.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath())
    p.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh })
    p.pushOperators(popGraphicsState())
  }
  /** The evening style's photos melt into the page: a page-coloured image, transparent at the top, solid at the bottom. */
  const fadeRef = (() => {
    if (!dark) return undefined
    const n = 128
    const alpha = new Uint8Array(n)
    for (let i = 0; i < n; i++) alpha[i] = Math.round(255 * Math.pow(i / (n - 1), 1.4)) // row 0 is the top
    const mask = doc.context.register(doc.context.stream(alpha, {
      Type: 'XObject', Subtype: 'Image', Width: 1, Height: n, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Interpolate: true,
    }))
    const c = t.page!
    const px = new Uint8Array(n * 3)
    for (let i = 0; i < n; i++) px.set([c.red, c.green, c.blue].map((v) => Math.round(v * 255)), i * 3)
    return doc.context.register(doc.context.stream(px, {
      Type: 'XObject', Subtype: 'Image', Width: 1, Height: n, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Interpolate: true, SMask: mask,
    }))
  })()
  const fadeBottom = (p: PDFPage, x: number, y: number, w: number, h: number) => {
    if (!fadeRef) return
    const fade = p.node.newXObject('Fade', fadeRef)
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(w, 0, 0, h, x, y), drawObject(fade), popGraphicsState())
  }
  const heart = (p: PDFPage, x: number, y: number, size: number) => {
    // Two circles and a triangle: the fonts have no heart sign.
    const r = size / 4
    p.drawCircle({ x: x + r, y: y + size * 0.55, size: r, color: t.heart })
    p.drawCircle({ x: x + 3 * r, y: y + size * 0.55, size: r, color: t.heart })
    p.drawSvgPath(`M 0 0 L ${size} 0 L ${size / 2} ${size * 0.62} Z`, { x, y: y + size * 0.62, color: t.heart, scale: 1 })
  }
  const folio = (p: PDFPage, n: number, label?: string) => {
    const s = label ? `${n}  ·  ${label.toLocaleUpperCase('ro')}` : String(n)
    centered(p, s, 22, sansBold, 7.5, t.muted, 1.2)
  }

  // ---- contents: how many pages it needs (each line links to its recipe) ----
  const TOC_TOP = H - 120
  type TocLine = { kind: 'cat'; text: string } | { kind: 'item'; r: CookbookRecipe }
  const tocLines: TocLine[] = groups.flatMap((g) => [{ kind: 'cat' as const, text: g.category }, ...g.items.map((r) => ({ kind: 'item' as const, r }))])
  const lineH = (l: TocLine) => (l.kind === 'cat' ? 34 : 21)
  const tocPagesPlan: TocLine[][] = [[]]
  {
    let y = TOC_TOP
    for (const l of tocLines) {
      if (y - lineH(l) < FOOT + 20 || (l.kind === 'cat' && y - 34 - 21 < FOOT + 20)) { tocPagesPlan.push([]); y = H - 70 }
      tocPagesPlan[tocPagesPlan.length - 1].push(l)
      y -= lineH(l)
    }
  }

  // ---- cover ----
  const coverPage = newPage()
  {
    const p = coverPage
    if (dark) {
      const hero = all.find((r) => r.favorite && images.has(r)) ?? all.find((r) => images.has(r))
      if (hero) { cover(p, images.get(hero)!, 0, 0, W, H); fadeBottom(p, 0, 0, W, H * 0.7); fadeBottom(p, 0, 0, W, H * 0.45) }
      kicker(p, 'Bucătăria cu povești', M, 250)
      text(p, 'Rețetele', M, 186, serif, 64, t.ink)
      text(p, 'noastre', M, 124, serif, 64, t.ink)
      const meta = `${count(all.length, 'rețetă', 'rețete')}  ·  ${MONTHS[input.date.getMonth()]} ${input.date.getFullYear()}`
      text(p, meta, M, 92, sans, 11, t.muted)
      if (input.authors) text(p, `adunate de ${input.authors}`, M, 72, serifItalic, 13, t.muted)
    } else {
      p.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: hex('#d6c39a'), borderWidth: 0.8 })
      p.drawRectangle({ x: 29, y: 29, width: W - 58, height: H - 58, borderColor: hex('#ecdfc3'), borderWidth: 0.8 })
      kicker(p, 'Bucătăria cu povești', 0, H - 120, true)
      centered(p, 'Rețetele', H - 196, serif, 62, t.ink)
      centered(p, 'noastre', H - 262, serif, 62, t.ink)
      if (input.authors) centered(p, `adunate de ${input.authors}`, H - 298, serifItalic, 16, t.soft)
      // Three photos: favourites first, then the most cooked.
      const picks = [...all].filter((r) => images.has(r)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.cooked - a.cooked).slice(0, 3)
      const top = H - 340, gx = 6, mx = 62, cw = W - 2 * mx
      if (picks.length >= 3) {
        const big = cw * 0.565, small = cw - big - gx, hh = 162
        cover(p, images.get(picks[0])!, mx, top - 2 * hh - gx, big, 2 * hh + gx)
        cover(p, images.get(picks[1])!, mx + big + gx, top - hh, small, hh)
        cover(p, images.get(picks[2])!, mx + big + gx, top - 2 * hh - gx, small, hh)
      } else if (picks.length) {
        cover(p, images.get(picks[0])!, mx, top - 330, cw, 330)
      }
      const cats = groups.length
      const meta = `${count(all.length, 'rețetă', 'rețete')}  ·  ${count(cats, 'categorie', 'categorii')}  ·  ${MONTHS[input.date.getMonth()]} ${input.date.getFullYear()}`
      centered(p, meta, 70, sans, 10.5, t.soft, 0.4)
    }
  }

  // Contents pages come right after the cover; they are filled in once the recipes have page numbers.
  const tocPages = tocPagesPlan.map(() => newPage())

  // ---- recipes ----
  const firstPage = new Map<CookbookRecipe, PDFPage>()
  const pageNo = new Map<CookbookRecipe, number>()
  const COL_GAP = 22
  const LEFT_W = 168
  const RIGHT_X = M + LEFT_W + COL_GAP
  const RIGHT_W = W - M - RIGHT_X
  const BODY = 9.6
  const LEAD = 14

  let done = 0
  for (const g of groups) {
    for (const r of g.items) {
      input.onProgress?.(done, all.length, r.recipe.title)
      const rec = r.recipe
      let p = newPage()
      firstPage.set(r, p)
      pageNo.set(r, doc.getPageCount())
      const label = g.category
      let y: number
      const img = images.get(r)
      if (img) {
        const hh = dark ? 300 : 250
        cover(p, img, 0, H - hh, W, hh)
        if (dark) fadeBottom(p, 0, H - hh, W, hh * 0.55)
        y = H - hh - (dark ? -10 : 34)
      } else {
        y = H - 86
      }
      kicker(p, label, M, y)
      y -= 34
      const titleSize = img ? 28 : 32
      for (const line of wrap(printable(rec.title), serif, titleSize, W - 2 * M)) { text(p, line, M, y, serif, titleSize, t.ink); y -= titleSize * 1.12 }
      y += titleSize * 1.12 - 6
      if (!img) { p.drawLine({ start: { x: M, y: y - 6 }, end: { x: M + 54, y: y - 6 }, thickness: 1, color: t.boxEdge }); y -= 10 }
      // Servings, time, how often cooked, favourite.
      y -= 18
      let x = M
      const chip = (bold: string, rest: string) => {
        text(p, bold, x, y, sansBold, 9.5, t.ink); x += sansBold.widthOfTextAtSize(bold, 9.5) + 3
        text(p, rest, x, y, sans, 9.5, t.muted); x += sans.widthOfTextAtSize(rest, 9.5) + 16
      }
      if (rec.servings) chip(String(rec.servings), rec.servings === 1 ? 'porție' : 'porții')
      if (rec.minutes) chip(String(rec.minutes), 'min')
      if (r.cooked) chip(String(r.cooked), r.cooked === 1 ? 'dată gătită' : 'ori gătită')
      if (r.favorite) { heart(p, x, y - 1, 9); text(p, 'favorită', x + 13, y, sans, 9.5, t.muted) }
      y -= 14
      p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: t.rule })
      y -= 24

      // Two columns that flow onto further pages when a recipe is long.
      const top = y
      const continued = () => {
        p = newPage()
        kicker(p, `${label}  ·  continuare`, M, H - 62)
        text(p, printable(rec.title), M, H - 88, serif, 18, t.ink)
        p.drawLine({ start: { x: M, y: H - 102 }, end: { x: W - M, y: H - 102 }, thickness: 0.6, color: t.rule })
        return H - 126
      }

      type Block = { h: number; draw: (pg: PDFPage, y: number) => void }
      const left: Block[] = []
      const right: Block[] = []
      left.push({ h: 18, draw: (pg, yy) => kicker(pg, 'Ingrediente', M, yy) })
      for (const raw of rec.ingredients) {
        const s = printable(raw)
        if (!s) continue
        const head = isHeading(s)
        const lines = wrap(s, head ? sansBold : sans, BODY, LEFT_W - (head ? 0 : 15))
        left.push({
          h: lines.length * LEAD + (head ? 8 : 3),
          draw: (pg, yy) => {
            const yy0 = yy - (head ? 6 : 0)
            if (!head) pg.drawRectangle({ x: M, y: yy0 - 1.5, width: 7.5, height: 7.5, borderColor: t.muted, borderWidth: 0.7 })
            lines.forEach((l, i) => text(pg, l, M + (head ? 0 : 15), yy0 - i * LEAD, head ? sansBold : sans, BODY, t.soft))
          },
        })
      }
      const n = rec.nutrition
      if (n) {
        left.push({
          h: 52,
          draw: (pg, yy) => {
            const cells = [[String(Math.round(n.kcal)), 'kcal'], [`${Math.round(n.protein)} g`, 'proteine'], [`${Math.round(n.carbs)} g`, 'carbohidrați']]
            const cw = LEFT_W / 3, bx = M, by = yy - 34
            pg.drawRectangle({ x: bx, y: by, width: LEFT_W, height: 38, borderColor: t.rule, borderWidth: 0.7 })
            cells.forEach(([v, k], i) => {
              if (i) pg.drawLine({ start: { x: bx + cw * i, y: by }, end: { x: bx + cw * i, y: by + 38 }, thickness: 0.7, color: t.rule })
              const vx = bx + cw * i + (cw - sansBold.widthOfTextAtSize(v, 10.5)) / 2
              text(pg, v, vx, by + 21, sansBold, 10.5, t.ink)
              text(pg, k, bx + cw * i + (cw - sans.widthOfTextAtSize(k, 7)) / 2, by + 9, sans, 7, t.muted)
            })
            text(pg, 'pe porție, estimat', bx, by - 10, sans, 7, t.muted)
          },
        })
      }

      right.push({ h: 18, draw: (pg, yy) => kicker(pg, 'Mod de preparare', RIGHT_X, yy) })
      rec.steps.map(printable).filter(Boolean).forEach((s, i) => {
        const lines = wrap(s, sans, BODY, RIGHT_W - 24)
        right.push({
          h: lines.length * LEAD + 8,
          draw: (pg, yy) => {
            pg.drawCircle({ x: RIGHT_X + 7.5, y: yy + 3, size: 7.5, color: t.stepDisc })
            const num = String(i + 1)
            text(pg, num, RIGHT_X + 7.5 - sansBlack.widthOfTextAtSize(num, 7.5) / 2, yy + 0.5, sansBlack, 7.5, t.stepNum)
            lines.forEach((l, j) => text(pg, l, RIGHT_X + 24, yy - j * LEAD, sans, BODY, t.soft))
          },
        })
      })
      // The recipe's own note, then the latest notes written after cooking.
      const quotes: { text: string; by: string }[] = []
      if (rec.notes?.trim()) quotes.push({ text: printable(rec.notes), by: 'Notă' })
      for (const c of r.notes.slice(-3).reverse()) quotes.push({ text: `„${printable(c.text)}”`, by: [c.by, romanianDate(c.day)].filter(Boolean).join(' · ') })
      for (const q of quotes) {
        const font = q.by === 'Notă' ? sans : serifItalic
        const lines = wrap(q.text, font, 10, RIGHT_W - 26)
        const h = lines.length * 14 + 30
        right.push({
          h: h + 10,
          draw: (pg, yy) => {
            const top0 = yy + 10
            pg.drawRectangle({ x: RIGHT_X, y: top0 - h, width: RIGHT_W, height: h, color: t.box })
            pg.drawRectangle({ x: RIGHT_X, y: top0 - h, width: 1.6, height: h, color: t.boxEdge })
            lines.forEach((l, j) => text(pg, l, RIGHT_X + 13, top0 - 18 - j * 14, font, 10, t.soft))
            text(pg, q.by, RIGHT_X + 13, top0 - h + 9, sans, 7.5, t.muted)
          },
        })
      }

      // Flow both columns from `top`; when one runs out of room both continue on a new page.
      let li = 0, ri = 0
      let ly = top, ry = top
      while (li < left.length || ri < right.length) {
        let moved = false
        while (li < left.length && ly - left[li].h >= FOOT + 14) { left[li].draw(p, ly); ly -= left[li].h; li++; moved = true }
        while (ri < right.length && ry - right[ri].h >= FOOT + 14) { right[ri].draw(p, ry); ry -= right[ri].h; ri++; moved = true }
        if (li < left.length || ri < right.length) {
          if (!moved && ly === top && ry === top) { li = left.length; ri = right.length; break } // a block taller than a page
          folio(p, doc.getPageCount(), label)
          ly = ry = continued()
        }
      }
      folio(p, doc.getPageCount(), label)
      if (p !== firstPage.get(r)) folio(firstPage.get(r)!, pageNo.get(r)!, label)
      done++
    }
  }
  input.onProgress?.(all.length, all.length, '')

  // ---- contents (now that every recipe has its page) ----
  tocPagesPlan.forEach((lines, i) => {
    const p = tocPages[i]
    let y: number
    if (i === 0) {
      text(p, 'Cuprins', M + 8, H - 92, serif, 34, t.ink)
      const legendY = H - 112
      heart(p, M + 8, legendY - 1, 8)
      text(p, '= favorită   ·   ×3 = de câte ori ați gătit-o', M + 20, legendY, sans, 8.5, t.muted)
      y = TOC_TOP - 22
    } else {
      y = H - 70
    }
    for (const l of lines) {
      if (l.kind === 'cat') { y -= 14; kicker(p, l.text, M + 8, y); y -= 20; continue }
      const r = l.r
      const title = printable(r.recipe.title)
      const num = String(pageNo.get(r) ?? '')
      let x = M + 8
      text(p, title, x, y, sans, 11, t.ink)
      x += sans.widthOfTextAtSize(title, 11) + 6
      if (r.favorite) { heart(p, x, y, 8); x += 12 }
      if (r.cooked) { const c = `×${r.cooked}`; text(p, c, x, y, sans, 8.5, t.muted); x += sans.widthOfTextAtSize(c, 8.5) + 6 }
      const nx = W - M - 8 - sans.widthOfTextAtSize(num, 11)
      // Dotted leader to the page number.
      for (let dx = x + 4; dx < nx - 6; dx += 4) p.drawCircle({ x: dx, y: y + 2.5, size: 0.45, color: t.muted })
      text(p, num, nx, y, sans, 11, t.ink)
      const target = firstPage.get(r)
      if (target) link(p, M, y - 5, W - 2 * M, 19, target.ref)
      y -= 21
    }
    folio(p, i + 2)
  })

  /** A tap on the rectangle opens `dest` (the recipe's first page). */
  function link(p: PDFPage, x: number, y: number, w: number, h: number, dest: PDFRef) {
    const annot = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0],
      Dest: [dest, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull],
    })
    const ref = doc.context.register(annot)
    const annots = p.node.lookup(PDFName.of('Annots'))
    if (annots instanceof PDFArray) annots.push(ref)
    else p.node.set(PDFName.of('Annots'), doc.context.obj([ref]))
  }
  const bytes = await doc.save()
  return { bytes, pages: doc.getPageCount() }
}
