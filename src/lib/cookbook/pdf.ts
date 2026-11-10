// The family cookbook as an A5 PDF: a cover, contents by category (each line links to its page) and
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

// A5 in points. The layout is written in the concept's pixels (design-polish/cookbook/board.html,
// pages 440 px wide) and scaled: 1 px = K pt, so the PDF matches the concept's proportions.
const W = 419.53
const H = 595.28
const K = W / 440
const PH = H / K // page height in px (~624)

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

// Colours from the concept's CSS.
interface Theme {
  page: RGB; ink: RGB; text: RGB; chips: RGB; muted: RGB; gold: RGB; rule: RGB; leader: RGB; box: RGB; boxEdge: RGB; noteText: RGB
  check: RGB; nutEdge: RGB; stepDisc: RGB; stepNum: RGB; heart: RGB; folio: RGB
}
const THEMES: Record<CookbookStyle, Theme> = {
  classic: {
    page: hex('#fbf7ef'), ink: hex('#2a231d'), text: hex('#2a231d'), chips: hex('#6f604e'), muted: hex('#8b7a63'), gold: hex('#a8792a'),
    rule: hex('#d9c9a8'), leader: hex('#c9b892'), box: hex('#f3ead7'), boxEdge: hex('#c9a35a'), noteText: hex('#5d4c37'), check: hex('#b9a37a'),
    nutEdge: hex('#e2d5b8'), stepDisc: hex('#f1e4c6'), stepNum: hex('#7a561c'), heart: hex('#c0504d'), folio: hex('#a8936e'),
  },
  evening: {
    page: hex('#14110f'), ink: hex('#f4efe6'), text: hex('#e7dfd3'), chips: hex('#cfc4b6'), muted: hex('#a49b91'), gold: hex('#f2c879'),
    rule: hex('#3a332d'), leader: hex('#4a4038'), box: hex('#221c17'), boxEdge: hex('#c9a35a'), noteText: hex('#e7dfd3'), check: hex('#8f8170'),
    nutEdge: hex('#3a332d'), stepDisc: hex('#3a3122'), stepNum: hex('#f2c879'), heart: hex('#e0736a'), folio: hex('#8f8170'),
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

  // ---- drawing in concept pixels, measured from the top of the page ----
  const X = (x: number) => x * K
  const Y = (top: number) => H - top * K
  const width = (s: string, font: PDFFont, size: number, track = 0) => font.widthOfTextAtSize(s, size) + track * size * Math.max(0, s.length - 1)
  /** Text with its baseline `base` px from the top; `track` is letter-spacing in em. */
  const text = (p: PDFPage, s: string, x: number, base: number, font: PDFFont, size: number, color: RGB, track = 0) => {
    if (track) p.pushOperators(setCharacterSpacing(track * size * K))
    p.drawText(s, { x: X(x), y: Y(base), font, size: size * K, color })
    if (track) p.pushOperators(setCharacterSpacing(0))
  }
  const centered = (p: PDFPage, s: string, base: number, font: PDFFont, size: number, color: RGB, track = 0) =>
    text(p, s, (440 - width(s, font, size, track)) / 2, base, font, size, color, track)
  const box = (p: PDFPage, x: number, top: number, w: number, h: number, o: { color?: RGB; border?: RGB; bw?: number; opacity?: number }) =>
    p.drawRectangle({ x: X(x), y: Y(top + h), width: X(w), height: X(h), color: o.color, borderColor: o.border, borderWidth: o.border ? (o.bw ?? 1) * K : undefined, opacity: o.opacity })
  const hline = (p: PDFPage, x: number, top: number, w: number, color: RGB, th = 1) => box(p, x, top, w, th, { color })
  const kicker = (p: PDFPage, s: string, x: number, base: number, size = 10, track = 0.2) => text(p, s.toLocaleUpperCase('ro'), x, base, sansBlack, size, t.gold, track)

  /** A vertical gradient of the page colour (alpha per stop, top to bottom) as an image, stretched over a box. */
  const gradient = (stops: [number, number][], color: RGB = t.page) => {
    const n = 256
    const alpha = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const at = i / (n - 1)
      let j = 0
      while (j < stops.length - 2 && at > stops[j + 1][0]) j++
      const [p0, a0] = stops[j], [p1, a1] = stops[j + 1]
      const f = p1 > p0 ? Math.min(1, Math.max(0, (at - p0) / (p1 - p0))) : 1
      alpha[i] = Math.round(255 * (a0 + (a1 - a0) * f))
    }
    const mask = doc.context.register(doc.context.stream(alpha, { Type: 'XObject', Subtype: 'Image', Width: 1, Height: n, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Interpolate: true }))
    const px = new Uint8Array(n * 3)
    for (let i = 0; i < n; i++) px.set([color.red, color.green, color.blue].map((v) => Math.round(v * 255)), i * 3)
    return doc.context.register(doc.context.stream(px, { Type: 'XObject', Subtype: 'Image', Width: 1, Height: n, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Interpolate: true, SMask: mask }))
  }
  /** The evening pages' warm glow at the top (the concept's radial gradient). */
  const glow = dark ? (() => {
    const w = 64, h = 40
    const alpha = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i / (w - 1) - 0.5) / 1.2, dy = (j / (h - 1)) / 1
      const d = Math.sqrt(dx * dx + dy * dy) / 0.6
      alpha[j * w + i] = Math.round(255 * 0.35 * Math.max(0, 1 - d))
    }
    const mask = doc.context.register(doc.context.stream(alpha, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Interpolate: true }))
    const px = new Uint8Array(w * h * 3).map((_, i) => [150, 90, 40][i % 3])
    return doc.context.register(doc.context.stream(px, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Interpolate: true, SMask: mask }))
  })() : undefined
  const stretch = (p: PDFPage, ref: PDFRef, x: number, top: number, w: number, h: number) => {
    const name = p.node.newXObject('G', ref)
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(X(w), 0, 0, X(h), X(x), Y(top + h)), drawObject(name), popGraphicsState())
  }
  const heroFade = dark ? gradient([[0, 0], [0.6, 0], [1, 1]]) : undefined // mask-image: #000 60%, transparent
  const coverShade = dark ? gradient([[0, 0.15], [0.4, 0.2], [0.78, 1], [1, 1]]) : undefined

  const newPage = () => {
    const p = doc.addPage([W, H])
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.page })
    if (glow) stretch(p, glow, 0, 0, 440, PH * 0.6)
    return p
  }
  /** Draws `img` filling the box (cropped to it, like CSS background-size: cover). */
  const cover = (p: PDFPage, img: PDFImage, x: number, top: number, w: number, h: number) => {
    const s = Math.max(w / img.width, h / img.height)
    const dw = img.width * s, dh = img.height * s
    p.pushOperators(pushGraphicsState(), rectangle(X(x), Y(top + h), X(w), X(h)), clip(), endPath())
    p.drawImage(img, { x: X(x + (w - dw) / 2), y: Y(top + (h + dh) / 2), width: X(dw), height: X(dh) })
    p.pushOperators(popGraphicsState())
  }
  /** ♥ drawn as two circles and a triangle: the fonts have no heart sign. `base` is the text baseline. */
  const heart = (p: PDFPage, x: number, base: number, size: number) => {
    const r = size / 4, cy = base - size * 0.5
    p.drawCircle({ x: X(x + r), y: Y(cy), size: X(r), color: t.heart })
    p.drawCircle({ x: X(x + 3 * r), y: Y(cy), size: X(r), color: t.heart })
    p.drawSvgPath(`M 0 0 L ${X(size)} 0 L ${X(size / 2)} ${X(size * 0.62)} Z`, { x: X(x), y: Y(cy - 0.12 * size), color: t.heart })
    return size
  }
  const folio = (p: PDFPage, n: number, label?: string) =>
    centered(p, label ? `${n}  ·  ${label.toLocaleUpperCase('ro')}` : String(n), PH - 21, sans, 10, t.folio, 0.14)

  // ---- contents: plan the pages first (they come before the recipes) ----
  const TOC_FIRST = 127, TOC_NEXT = 52, TOC_END = PH - 52
  type TocLine = { kind: 'cat'; text: string } | { kind: 'item'; r: CookbookRecipe }
  const lineH = (l: TocLine) => (l.kind === 'cat' ? 39 : 24)
  const tocPlan: TocLine[][] = [[]]
  {
    let y = TOC_FIRST
    for (const g of groups) {
      const lines: TocLine[] = [{ kind: 'cat', text: g.category }, ...g.items.map((r) => ({ kind: 'item' as const, r }))]
      lines.forEach((l, i) => {
        const need = lineH(l) + (i === 0 ? 24 : 0) // a category title never ends a page
        if (y + need > TOC_END) { tocPlan.push([]); y = TOC_NEXT }
        tocPlan[tocPlan.length - 1].push(l)
        y += lineH(l)
      })
    }
  }

  // ---- cover ----
  {
    const p = newPage()
    const meta = (cats: boolean) => [count(all.length, 'rețetă', 'rețete'), cats ? count(groups.length, 'categorie', 'categorii') : '', `${MONTHS[input.date.getMonth()]} ${input.date.getFullYear()}`].filter(Boolean)
    if (dark) {
      const hero = all.find((r) => r.favorite && images.has(r)) ?? all.find((r) => images.has(r))
      if (hero) cover(p, images.get(hero)!, 0, 0, 440, PH)
      if (hero && coverShade) stretch(p, coverShade, 0, 0, 440, PH)
      // .tx: left 36, bottom 60; kicker, 48 px title (line-height 1), 13 px line.
      const bottom = PH - 60
      text(p, meta(false).join(' · '), 36, bottom - 3, sans, 13, t.chips)
      text(p, 'noastre', 36, bottom - 16 - 10 - 10, serif, 48, t.ink)
      text(p, 'Rețetele', 36, bottom - 16 - 10 - 10 - 48, serif, 48, t.ink)
      kicker(p, 'Bucătăria cu povești', 36, bottom - 16 - 10 - 96 - 10 - 2, 11, 0.24)
    } else {
      box(p, 16, 16, 440 - 32, PH - 32, { border: hex('#d6c39a') })
      box(p, 21, 21, 440 - 42, PH - 42, { border: hex('#ecdfc3') })
      centered(p, 'BUCĂTĂRIA CU POVEȘTI', 73, sansBlack, 11, t.gold, 0.24)
      centered(p, 'Rețetele', 128, serif, 46, t.ink)
      centered(p, 'noastre', 175, serif, 46, t.ink)
      if (input.authors) centered(p, `adunate de ${input.authors}`, 205, serifItalic, 16, hex('#7b6a55'))
      // Three photos, favourites first, then the most cooked: one tall on the left, two on the right.
      const picks = [...all].filter((r) => images.has(r)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.cooked - a.cooked).slice(0, 3)
      const top = 248, left = 46, w = 440 - 92, gap = 6
      const big = ((w - gap) * 1.3) / 2.3, small = w - gap - big
      if (picks.length >= 3) {
        cover(p, images.get(picks[0])!, left, top, big, 242)
        cover(p, images.get(picks[1])!, left + big + gap, top, small, 118)
        cover(p, images.get(picks[2])!, left + big + gap, top + 124, small, 118)
      } else if (picks.length === 2) {
        cover(p, images.get(picks[0])!, left, top, big, 242)
        cover(p, images.get(picks[1])!, left + big + gap, top, small, 242)
      } else if (picks.length) {
        cover(p, images.get(picks[0])!, left, top, w, 242)
      }
      // "24 de rețete · 6 categorii · noiembrie 2026", the first part bold.
      const parts = meta(true)
      const sep = '  ·  '
      const full = width(parts[0], sansBold, 12, 0.06) + width(sep + parts.slice(1).join(sep), sans, 12, 0.06)
      const x0 = (440 - full) / 2, base = PH - 48
      text(p, parts[0], x0, base, sansBold, 12, t.ink, 0.06)
      text(p, sep + parts.slice(1).join(sep), x0 + width(parts[0], sansBold, 12, 0.06), base, sans, 12, hex('#7b6a55'), 0.06)
    }
  }

  const tocPages = tocPlan.map(() => newPage())

  // ---- recipes ----
  const firstPage = new Map<CookbookRecipe, PDFPage>()
  const pageNo = new Map<CookbookRecipe, number>()
  const L = 30, LW = 150, R = 200, RW = 210 // the two columns: .cols 150px 1fr, gap 20, page padding 30
  const SIZE = 11.5, LH = 17.25 // font-size 11.5px, line-height 1.5
  const END = PH - 46 // content stops above the folio
  const firstBase = (lh: number, size: number) => (lh - size) / 2 + size * 0.78

  let done = 0
  for (const g of groups) {
    for (const r of g.items) {
      input.onProgress?.(done, all.length, r.recipe.title)
      const rec = r.recipe
      const label = g.category
      let p = newPage()
      firstPage.set(r, p)
      pageNo.set(r, doc.getPageCount())
      const img = images.get(r)
      let y: number
      if (img) {
        const hh = dark ? 230 : 176
        cover(p, img, 0, 0, 440, hh)
        if (heroFade) stretch(p, heroFade, 0, 0, 440, hh + 0.5)
        y = dark ? hh - 30 : hh + 20
      } else {
        y = 44
      }
      kicker(p, label, L, y + 9)
      y += 12
      const ts = img ? 30 : 34, tl = ts * 1.05
      y += 6
      for (const line of wrap(printable(rec.title), serif, ts, 440 - 2 * L)) { text(p, line, L, y + firstBase(tl, ts), serif, ts, t.ink); y += tl }
      y += img ? 8 : 0
      if (!img) { hline(p, L, y + 10, 60, t.boxEdge); y += 10 + 1 + 12 }
      // .chips: servings, minutes, times cooked, favourite.
      let x = L
      const cb = y + firstBase(14, 11.5)
      const chip = (n: string, rest: string) => {
        if (n) { text(p, n, x, cb, sansBold, 11.5, t.ink); x += width(n, sansBold, 11.5) + 3 }
        text(p, rest, x, cb, sans, 11.5, t.chips); x += width(rest, sans, 11.5) + 14
      }
      if (rec.servings) chip(String(rec.servings), rec.servings === 1 ? 'porție' : 'porții')
      if (rec.minutes) chip(String(rec.minutes), 'min')
      if (r.cooked === 1) chip('', 'gătită o dată')
      else if (r.cooked) {
        // "gătită de 9 ori", the number bold, as in the concept.
        const a = 'gătită de'
        text(p, a, x, cb, sans, 11.5, t.chips); x += width(a, sans, 11.5) + 3
        chip(String(r.cooked), r.cooked >= 20 && (r.cooked % 100 === 0 || r.cooked % 100 >= 20) ? 'de ori' : 'ori')
      }
      if (r.favorite) { heart(p, x, cb, 10); text(p, 'favorită', x + 14, cb, sans, 11.5, t.chips) }
      y += 14 + 12
      hline(p, L, y, 440 - 2 * L, t.rule)
      y += 1 + 12

      const continued = () => {
        p = newPage()
        kicker(p, `${label}  ·  continuare`, L, 44)
        text(p, printable(rec.title), L, 70, serif, 20, t.ink)
        hline(p, L, 82, 440 - 2 * L, t.rule)
        return 96
      }

      type Block = { h: number; draw: (pg: PDFPage, top: number) => void }
      const left: Block[] = [], right: Block[] = []
      const heading = (s: string, x: number) => ({ h: 19, draw: (pg: PDFPage, top: number) => kicker(pg, s, x, top + 9, 10, 0.18) })
      left.push(heading('Ingrediente', L))
      const bullet = '· '
      const bw = width(bullet, sansBold, SIZE)
      for (const raw of rec.ingredients) {
        const s = printable(raw)
        if (!s) continue
        if (isHeading(s)) {
          const lines = wrap(s, sansBold, SIZE, LW)
          left.push({ h: 6 + lines.length * LH + 3, draw: (pg, top) => lines.forEach((l, i) => text(pg, l, L, top + 6 + firstBase(LH, SIZE) + i * LH, sansBold, SIZE, t.text)) })
          continue
        }
        const indent = dark ? bw : 16
        const lines = wrap(s, sans, SIZE, LW - indent)
        left.push({
          h: lines.length * LH + 3,
          draw: (pg, top) => {
            if (dark) text(pg, bullet, L, top + firstBase(LH, SIZE), sansBold, SIZE, t.gold)
            else box(pg, L, top + 4, 9, 9, { border: t.check })
            lines.forEach((l, i) => text(pg, l, L + indent, top + firstBase(LH, SIZE) + i * LH, sans, SIZE, t.text))
          },
        })
      }
      const n = rec.nutrition
      if (n) {
        left.push({
          h: 10 + 40,
          draw: (pg, top) => {
            const cells = [[String(Math.round(n.kcal)), 'kcal'], [String(Math.round(n.protein)), 'prot.'], [String(Math.round(n.carbs)), 'carb.']]
            const by = top + 10, cw = LW / 3
            pg.drawRectangle({ x: X(L), y: Y(by + 40), width: X(LW), height: X(40), borderColor: t.nutEdge, borderWidth: K })
            cells.forEach(([v, k], i) => {
              if (i) box(pg, L + cw * i, by, 1, 40, { color: t.nutEdge })
              const cx = L + cw * i + cw / 2
              text(pg, v, cx - width(v, sansBold, 13) / 2, by + 6 + 12, sansBold, 13, t.ink)
              text(pg, k, cx - width(k, sans, 10) / 2, by + 6 + 15.6 + 10, sans, 10, t.chips)
            })
          },
        })
      }

      right.push(heading('Mod de preparare', R))
      rec.steps.map(printable).filter(Boolean).forEach((s, i) => {
        const num = dark ? `${i + 1}.` : String(i + 1)
        const indent = dark ? 16 : 27
        const lines = wrap(s, sans, SIZE, RW - indent)
        right.push({
          h: lines.length * LH + 7,
          draw: (pg, top) => {
            if (dark) text(pg, num, R + 12 - width(num, sansBlack, SIZE), top + firstBase(LH, SIZE), sansBlack, SIZE, t.gold)
            else {
              pg.drawCircle({ x: X(R + 9), y: Y(top + 1 + 9), size: X(9), color: t.stepDisc })
              text(pg, num, R + 9 - width(num, sansBlack, 10) / 2, top + 1 + 9 + 3.6, sansBlack, 10, t.stepNum)
            }
            lines.forEach((l, j) => text(pg, l, R + indent, top + firstBase(LH, SIZE) + j * LH, sans, SIZE, t.text))
          },
        })
      })
      // The recipe's own note, then the latest notes written after cooking (.note).
      const quotes: { text: string; by?: string; font: PDFFont }[] = []
      if (rec.notes?.trim()) quotes.push({ text: printable(rec.notes), font: serifItalic })
      for (const c of r.notes.slice(-3).reverse()) quotes.push({ text: `„${printable(c.text)}”`, by: [c.by, romanianDate(c.day)].filter(Boolean).join(' · '), font: serifItalic })
      for (const q of quotes) {
        const lines = wrap(q.text, q.font, 12, RW - 26)
        const inner = lines.length * 16.8 + (q.by ? 4 + 12 : 0)
        const h = 9 + inner + 9
        right.push({
          h: 10 + h,
          draw: (pg, top) => {
            const bt = top + 10
            box(pg, R, bt, RW, h, { color: t.box })
            box(pg, R, bt, 2, h, { color: t.boxEdge })
            lines.forEach((l, j) => text(pg, l, R + 12, bt + 9 + firstBase(16.8, 12) + j * 16.8, q.font, 12, t.noteText))
            if (q.by) text(pg, q.by, R + 12, bt + 9 + lines.length * 16.8 + 4 + 9.5, sans, 10, t.muted)
          },
        })
      }

      // Flow both columns; when one runs out of room both continue on a new page.
      const top = y
      let li = 0, ri = 0, ly = top, ry = top
      for (;;) {
        while (li < left.length && ly + left[li].h <= END) { left[li].draw(p, ly); ly += left[li].h; li++ }
        while (ri < right.length && ry + right[ri].h <= END) { right[ri].draw(p, ry); ry += right[ri].h; ri++ }
        if (li >= left.length && ri >= right.length) break
        const fresh = continued()
        if (ly === fresh && ry === fresh) break // a single block taller than a page: give up on it
        folio(p, doc.getPageCount(), label)
        ly = ry = fresh
      }
      folio(p, doc.getPageCount(), label)
      const first = firstPage.get(r)!
      if (p !== first) folio(first, pageNo.get(r)!, label)
      done++
    }
  }
  input.onProgress?.(all.length, all.length, '')

  // ---- contents ----
  tocPlan.forEach((lines, i) => {
    const p = tocPages[i]
    const x0 = 44, x1 = 440 - 44
    let y: number
    if (i === 0) {
      text(p, 'Cuprins', x0, 48 + firstBase(38, 32), serif, 32, t.ink)
      const lb = 90 + firstBase(15, 12)
      heart(p, x0, lb, 10)
      text(p, '= favorită  ·  cifra mică = de câte ori ați gătit-o', x0 + 13, lb, sans, 12, t.muted)
      y = TOC_FIRST
    } else {
      y = TOC_NEXT
    }
    for (const l of lines) {
      if (l.kind === 'cat') { kicker(p, l.text, x0, y + 18 + 9.5, 10.5, 0.2); y += 39; continue }
      const r = l.r
      const base = y + 7 + firstBase(17, 14)
      const title = printable(r.recipe.title)
      const num = String(pageNo.get(r) ?? '')
      let x = x0
      text(p, title, x, base, sans, 14, t.ink)
      x += width(title, sans, 14) + 6
      if (r.favorite) { x += heart(p, x, base - 1, 10) + 4 }
      if (r.cooked) { const c = `×${r.cooked}`; text(p, c, x, base, sans, 12, t.muted); x += width(c, sans, 12) + 6 }
      const nx = x1 - width(num, sans, 14)
      for (let dx = x + 2; dx < nx - 6; dx += 3) p.drawCircle({ x: X(dx), y: Y(base), size: 0.42, color: t.leader })
      text(p, num, nx, base, sans, 14, t.ink)
      const target = firstPage.get(r)
      if (target) link(p, x0, y + 3, x1 - x0, 22, target.ref)
      y += 24
    }
    folio(p, i + 2)
  })

  /** A tap on the box opens `dest` (the recipe's first page). */
  function link(p: PDFPage, x: number, top: number, w: number, h: number, dest: PDFRef) {
    const annot = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [X(x), Y(top + h), X(x + w), Y(top)], Border: [0, 0, 0],
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
