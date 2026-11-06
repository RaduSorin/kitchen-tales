// The colour of a book's spine on the shelf: the main colour of its cover picture, made a little
// darker or lighter so the title on it can be read. Worked out once per cover, on this device, from
// the cover that is already saved here (so it also works offline), and remembered.
import { useEffect, useState } from 'react'
import type { Story } from './types'
import { coverColor } from './stories'
import { loadCoverBlob } from './useCoverUrl'
import { getCover, saveCover } from './offline'

/** spine = the spine colour, ink = the title colour on it, dark = the back cover. */
export type Tint = { spine: string; ink: string; dark: string }

const KEY = 'kt-cover-tints'
const CREAM: Rgb = [255, 246, 214]
const INK: Rgb = [23, 26, 69]
type Rgb = [number, number, number]

let saved: Record<string, Tint> | undefined
function store() {
  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Tint> } catch { saved = {} }
  }
  return saved
}
function remember(coverKey: string, tint: Tint) {
  const all = store()
  all[coverKey] = tint
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage unavailable: worked out again next time */ }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function hslToRgb(h: number, s: number, l: number): Rgb {
  if (!s) return [l * 255, l * 255, l * 255]
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}
function luminance(c: Rgb) {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
  return .2126 * r + .7152 * g + .0722 * b
}
const contrast = (a: Rgb, b: Rgb) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
const inkFor = (c: Rgb) => hex(contrast(c, CREAM) >= contrast(c, INK) ? CREAM : INK)

/**
 * The main colour of a picture: shrink it to 40×40, group the points by hue and lightness, leave
 * out white, black and greys, and keep the biggest group (more colourful points count a bit more).
 */
export function dominantColor(img: CanvasImageSource): Rgb | undefined {
  const n = 40, canvas = document.createElement('canvas')
  canvas.width = canvas.height = n
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(img, 0, 0, n, n)
  const d = ctx.getImageData(0, 0, n, n).data
  const bins = new Map<number, { w: number; r: number; g: number; b: number }>()
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2])
    if (l < .1 || l > .93 || s < .16) continue
    const key = (Math.round(h * 18) % 18) * 3 + (l < .4 ? 0 : l < .68 ? 1 : 2), w = .25 + s
    const e = bins.get(key) ?? { w: 0, r: 0, g: 0, b: 0 }
    e.w += w; e.r += d[i] * w; e.g += d[i + 1] * w; e.b += d[i + 2] * w
    bins.set(key, e)
  }
  let best: { w: number; r: number; g: number; b: number } | undefined
  for (const e of bins.values()) if (!best || e.w > best.w) best = e
  return best ? [best.r / best.w, best.g / best.w, best.b / best.w] : undefined
}

/** A spine colour from a cover colour: not too pale, not too dark, not too loud. */
export function tintFrom(c: Rgb): Tint {
  const [h, s, l] = rgbToHsl(...c)
  const spine = hslToRgb(h, clamp(s, .35, .8), clamp(l, .34, .64))
  return { spine: hex(spine), ink: inkFor(spine), dark: hex(hslToRgb(h, clamp(s, .3, .7), clamp(l, .34, .64) * .62)) }
}

/** A story without a cover keeps the colour its tile already has. */
export function plainTint(title: string, scene?: number): Tint {
  const c = fromHex(coverColor(title, scene))
  const [h, s, l] = rgbToHsl(...c)
  return { spine: hex(c), ink: inkFor(c), dark: hex(hslToRgb(h, s, l * .6)) }
}

function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// ---------- Small spine pictures ----------
// A spine shows its cover at about 40 px. Drawing the full cover there for every book of a big
// folder used up the iPhone's memory (Safari reloaded the page), so each spine gets a 96 px copy,
// made once from the saved cover, kept on the device, and made a few at a time.

const THUMB = 96
const thumbs = new Map<string, string>()
const thumbKey = (key: string) => `${key}#spine`
let running = 0
const waiting: (() => void)[] = []
async function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r))
  running++
  try { return await job() } finally { running--; waiting.shift()?.() }
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | undefined>((r) => canvas.toBlob((b) => r(b ?? undefined), 'image/jpeg', .82))
}

/** Makes the spine picture (and the spine colour, if not known yet) from the full cover. */
async function makeSpineArt(key: string): Promise<string | undefined> {
  const saved = await getCover(thumbKey(key)).catch(() => undefined)
  if (saved && store()[key]) return URL.createObjectURL(saved)
  const blob = await loadCoverBlob(key)
  if (!blob) return undefined
  const full = URL.createObjectURL(blob)
  try {
    const img = await load(full)
    if (!store()[key]) {
      const c = dominantColor(img)
      if (c) remember(key, tintFrom(c))
    }
    if (saved) return URL.createObjectURL(saved)
    // Cropped to a square, like the cover tiles.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = THUMB
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, THUMB, THUMB)
    const small = await toBlob(canvas)
    if (!small) return undefined
    saveCover(thumbKey(key), small).catch(() => {})
    return URL.createObjectURL(small)
  } finally {
    URL.revokeObjectURL(full)
  }
}

const pending = new Map<string, Promise<string | undefined>>()
function spineArt(key: string) {
  let p = pending.get(key)
  if (!p) {
    p = oneAtATime(() => makeSpineArt(key)).then((url) => { if (url) thumbs.set(key, url); return url }).catch(() => undefined)
    pending.set(key, p)
    p.finally(() => pending.delete(key))
  }
  return p
}

/** A small picture of the cover for a spine, and the spine colours worked out from the cover. */
export function useSpineArt(story: Pick<Story, 'title' | 'coverKey' | 'scene'>) {
  const key = story.coverKey
  const [found, setFound] = useState<{ key: string; thumb?: string }>()
  useEffect(() => {
    if (!key || thumbs.has(key)) return
    let live = true
    spineArt(key).then((thumb) => { if (live) setFound({ key, thumb }) })
    return () => { live = false }
  }, [key])
  const thumb = key ? thumbs.get(key) ?? (found?.key === key ? found.thumb : undefined) : undefined
  const tint = (key && store()[key]) || plainTint(story.title, story.scene)
  return { thumb, tint }
}
