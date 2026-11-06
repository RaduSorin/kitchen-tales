// The stories background glows in the colours of a story's cover (design "Seară de lux").
// Each screen says which story lights it: the one you're listening to, the one to continue,
// the folder's current story, or the book picked on the shelf. Nothing set: the story playing.
import { useEffect, useSyncExternalStore } from 'react'
import type { Story } from './types'

export type GlowStory = Pick<Story, 'id' | 'title' | 'coverKey'>

let current: GlowStory | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** The story whose cover lights the stories background right now (if a screen chose one). */
export function useGlowStory() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
}

/** A screen's choice of story for the background glow, for as long as the screen is open. */
export function useGlow(story: GlowStory | undefined) {
  const id = story?.id, key = story?.coverKey, title = story?.title
  useEffect(() => {
    if (!id || title === undefined) return
    const mine = { id, title, coverKey: key }
    current = mine
    emit()
    return () => { if (current === mine) { current = undefined; emit() } }
  }, [id, key, title])
}

// ---------- Is this picture colourful enough to glow? ----------
// A black-and-white drawing would make a grey glow, so those (and failed reads) use the warm default.

const colourful = new Map<string, boolean>()

export function knownColourful(url: string) {
  return colourful.get(url)
}

/** True when enough of the picture is clearly coloured. Reads a 16×16 copy of a loaded image. */
export function checkColourful(url: string, img: HTMLImageElement) {
  let ok = false
  try {
    const n = 16, c = document.createElement('canvas')
    c.width = c.height = n
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(img, 0, 0, n, n)
      const d = ctx.getImageData(0, 0, n, n).data
      let coloured = 0, seen = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue
        seen++
        const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2])
        // Saturation of the point, ignoring near-black and near-white.
        if (max > 40 && min < 235 && (max - min) / max > 0.28) coloured++
      }
      ok = seen > 0 && coloured / seen > 0.18
    }
  } catch { ok = false }
  colourful.set(url, ok)
  return ok
}
