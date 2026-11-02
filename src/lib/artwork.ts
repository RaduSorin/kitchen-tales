import type { Story } from './types'
import { coverColor } from './stories'

const SIZE = 512

/**
 * A square PNG (as a data URL) for the phone's lock screen / Now Playing: the story cover cropped to
 * a square, or the same colored tile with the emoji that the shelf shows when there is no cover.
 * Drawn locally so it works offline and never points at an expiring S3 link.
 */
export async function storyArtwork(story: Pick<Story, 'title' | 'emoji'>, coverUrl?: string): Promise<string | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.fillStyle = coverColor(story.title)
  ctx.fillRect(0, 0, SIZE, SIZE)
  const img = coverUrl ? await loadImage(coverUrl).catch(() => undefined) : undefined
  if (img) {
    // object-fit: cover
    const scale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  } else if (story.emoji) {
    ctx.font = `${SIZE * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(story.emoji, SIZE / 2, SIZE / 2 + SIZE * 0.03)
  }
  try { return canvas.toDataURL('image/png') } catch { return undefined }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
