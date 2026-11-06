import type { Story } from './types'
import { COVER_IMG_BG, coverScene } from './stories'

const SIZE = 512

/**
 * A square JPEG (as a data URL; small, which car stereos handle better than a large PNG) for the phone's lock screen / Now Playing: the story cover cropped to
 * a square, or the same illustrated cover (sky, hills, emoji) that the shelf shows when there is none.
 * Drawn locally so it works offline and never points at an expiring S3 link.
 */
export async function storyArtwork(story: Pick<Story, 'title' | 'emoji'>, coverUrl?: string): Promise<string | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  drawScene(ctx, story.title)
  const img = coverUrl ? await loadImage(coverUrl).catch(() => undefined) : undefined
  if (img) {
    // Cream under the picture, so a transparent drawing doesn't show the sky through it.
    ctx.fillStyle = COVER_IMG_BG
    ctx.fillRect(0, 0, SIZE, SIZE)
    // object-fit: cover
    const scale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  } else if (story.emoji) {
    ctx.font = `${SIZE * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(story.emoji, SIZE / 2, SIZE * 0.47)
  }
  try { return canvas.toDataURL('image/jpeg', 0.85) } catch { return undefined }
}

/** The illustrated cover (components/CoverScene.tsx) drawn on the canvas, in the same 0-100 units. */
function drawScene(ctx: CanvasRenderingContext2D, title: string) {
  const s = coverScene(title), k = SIZE / 100
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE)
  sky.addColorStop(0, s.top); sky.addColorStop(1, s.bottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 9; i++) {
    ctx.globalAlpha = 0.35 + (i % 3) * 0.2
    ctx.beginPath(); ctx.arc(((i * 37 + 11) % 100) * k, (((i * 53 + 7) % 45) + 4) * k, ((i % 3) * 0.35 + 0.5) * k, 0, Math.PI * 2); ctx.fill()
  }
  const glow = ctx.createRadialGradient(50 * k, 46 * k, 0, 50 * k, 46 * k, 42 * k)
  glow.addColorStop(0, s.glow); glow.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.75; ctx.fillStyle = glow; ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = s.hill
  ctx.globalAlpha = 0.55
  ctx.fill(new Path2D(`M0 ${78 * k}Q${30 * k} ${66 * k} ${55 * k} ${76 * k}T${SIZE} ${72 * k}V${SIZE}H0z`))
  ctx.globalAlpha = 0.85
  ctx.fill(new Path2D(`M0 ${86 * k}Q${40 * k} ${78 * k} ${70 * k} ${86 * k}T${SIZE} ${84 * k}V${SIZE}H0z`))
  ctx.globalAlpha = 1
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
