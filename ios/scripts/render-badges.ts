// Draws every stamp and sticker of the web app (src/lib/badges/art.ts) as PNGs for the iOS app,
// so both show exactly the same pictures. The postmark (with the day it was earned) is drawn
// by the app itself on top. Run from the repo root after changing the badges:
//   npx tsx ios/scripts/render-badges.ts
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { BADGES } from '../../src/lib/badges/catalog'
import { inked, plainStampSvg, stampSvg, stickerSvg } from '../../src/lib/badges/art'

// Playwright may be installed globally (not in package.json): found the CommonJS way.
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')

const OUT = 'ios/KitchenTales/Resources/Badges'
const PX = 360 // width of each picture, in pixels

const font = (family: string, file: string, weight: number) =>
  `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${file}`).toString('base64')}) format('woff2')}`
const fonts = [
  font('Figtree', 'figtree/files/figtree-latin-ext-700-normal.woff2', 700),
  font('Figtree', 'figtree/files/figtree-latin-700-normal.woff2', 700),
  font('Fraunces', 'fraunces/files/fraunces-latin-600-normal.woff2', 600),
  font('Baloo 2', 'baloo-2/files/baloo-2-latin-700-normal.woff2', 700),
].join('')

const items: { name: string; svg: string; px?: number }[] = []
for (const b of BADGES) {
  if (b.kind === 'stamp') {
    items.push({ name: `stamp-${b.id}`, svg: plainStampSvg(b) })
    const missing = stampSvg(b).replace('viewBox="0 0 150 124"', 'viewBox="0 0 120 124"')
    items.push({ name: `stamp-${b.id}-missing`, svg: missing })
    items.push({ name: `stamp-${b.id}-missing-ink`, svg: inked(missing, '95 55 62', 1.7) })
  } else {
    items.push({ name: `sticker-${b.id}`, svg: stickerSvg(b, true) })
    items.push({ name: `sticker-${b.id}-missing`, svg: stickerSvg(b, false) })
  }
}

// The passport's emblem, the album's pen doodles and the visa pages' security print, from
// src/components/Badges.tsx, in white: the app tints them with each page's ink.
const pen = (box: string, d: string, w = 2) => `<svg viewBox="${box}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
items.push({ name: 'emblem', svg: pen('0 0 100 100', '<circle cx="50" cy="50" r="46" stroke-width="1.2"/><circle cx="50" cy="50" r="42" stroke-width=".7" stroke-dasharray="1 3"/><path d="M36 62V52c-8-2-11-11-5-17 4-4 10-4 13-2 3-8 13-8 16 0 5-4 13-1 14 6 1 7-4 12-10 13v10z"/><path d="M36 67h28"/><path d="M42 54v6M50 53v7M58 54v6" stroke-width="1.4"/><path d="M18 58c2 12 10 20 22 24M82 58c-2 12-10 20-22 24M19 64l-5-1M22 71l-5 1M27 77l-4 3M81 64l5-1M78 71l5 1M73 77l4 3" stroke-width="1.4"/><path d="M50 14l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3-3.7-2.4-3.7 2.4 1.1-4.3-3.4-2.8 4.4-.3z" stroke-width="1.2"/>', 2.2) })
const DOODLES = [
  ['0 0 46 34', '<path d="M14 3l3 8 8 1-6 6 2 9-7-5-8 4 2-9-6-6 9-1z"/><path d="M36 20l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/><path d="M40 6v4M38 8h4"/>'],
  ['0 0 48 40', '<path d="M30 6c-9 1-15 9-13 18 2 8 10 13 19 11-11 8-27 1-28-13C7 9 19 0 30 6z"/><path d="M40 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>'],
  ['0 0 48 34', '<path d="M4 20c6-14 20-16 26-6s-6 18-13 12 2-13 7-9"/><path d="M38 8l4-4M40 16h6"/>'],
  ['0 0 48 30', '<path d="M3 12c4-8 10-8 14 0s10 8 14 0 10-8 14 0"/><path d="M3 24c4-8 10-8 14 0s10 8 14 0 10-8 14 0" opacity=".6"/>'],
  ['0 0 44 38', '<path d="M22 34C6 24 2 14 8 8c5-5 12-2 14 4 2-6 9-9 14-4 6 6 2 16-14 26z"/>'],
]
DOODLES.forEach(([box, d], i) => items.push({ name: `doodle-${i}`, svg: pen(box, d) }))
items.push({ name: 'trail', svg: pen('0 0 78 28', '<path d="M2 20c10-16 22 10 34-4s20-10 28-2" stroke-dasharray="1 7"/><path d="M70 10l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/>') })
{
  const W = 282, H = 470, lines: string[] = []
  for (let k = 0; k < 31; k++) {
    let d = ''
    for (let x = 0; x <= W; x += 6) d += `${x ? 'L' : 'M'}${x} ${(k * 16 - 8 + 8 * Math.sin(x / 24 + k * 0.55) + 3.5 * Math.sin(x / 8 + k * 1.3)).toFixed(1)}`
    lines.push(`<path d="${d}"/>`)
  }
  let rose = ''
  for (let a = 0; a < 180; a += 10) rose += `<ellipse cx="141" cy="245" rx="122" ry="45" transform="rotate(${a} 141 245)"/>`
  items.push({ name: 'guilloche', px: 900, svg: `<svg viewBox="0 0 ${W} ${H}" fill="none" stroke="#fff"><g stroke-width=".55" opacity=".2">${lines.join('')}</g><g stroke-width=".5" opacity=".16">${rose}</g></svg>` })
}

const html = `<!doctype html><style>${fonts} body{margin:0;background:transparent} .b{width:${PX}px;display:block} .b svg{display:block;width:100%;height:auto;overflow:visible}</style>
${items.map((x, i) => `<div class="b" id="b${i}"${x.px ? ` style="width:${x.px}px"` : ''}>${x.svg}</div>`).join('')}`

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
for (const [i, x] of items.entries()) {
  const png = await page.locator(`#b${i}`).screenshot({ omitBackground: true })
  writeFileSync(`${OUT}/${x.name}.png`, png)
}
await browser.close()
console.log(`${items.length} pictures in ${OUT}`)
