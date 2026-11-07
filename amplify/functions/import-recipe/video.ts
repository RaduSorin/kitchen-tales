// Recipes from video links (YouTube, TikTok, Instagram): the recipe is usually written in the
// description or caption, sometimes only spoken (then YouTube's subtitles help). Everything is
// read from public pages and oEmbed endpoints, without accounts or keys; whatever a platform
// refuses is simply left out, and what is left goes to the model like any other page text.
import { safeFetch } from '../../shared/safeFetch'

export type Platform = 'youtube' | 'tiktok' | 'instagram'
export type VideoText = {
  platform: Platform
  url: string
  title?: string
  author?: string
  /** Description or caption. */
  caption?: string
  /** Spoken words, from subtitles. */
  transcript?: string
  thumbnail?: string
}

export const PLATFORM_NAME: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (KitchenTales recipe import)', 'Accept-Language': 'ro,en;q=0.8' }
const TIMEOUT = 8_000
const MAX = 20_000

/** Which platform a link belongs to, or undefined for any other site. */
export function platformOf(raw: string): Platform | undefined {
  let host: string
  try { host = new URL(raw).hostname.toLowerCase().replace(/^(www|m|mobile|music|vm|vt)\./, '') } catch { return undefined }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') return 'youtube'
  if (host === 'tiktok.com') return 'tiktok'
  if (host === 'instagram.com' || host === 'instagr.am') return 'instagram'
  return undefined
}

/** The video id of any YouTube link: watch?v=, youtu.be/, /shorts/, /embed/, /live/. */
export function youtubeId(raw: string): string | undefined {
  try {
    const u = new URL(raw)
    const v = u.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return v
    const m = u.pathname.match(/^\/(?:shorts\/|embed\/|live\/|v\/)?([\w-]{11})(?:[/?]|$)/)
    return m?.[1]
  } catch { return undefined }
}

/** The post code of an Instagram post or reel link (/p/…, /reel/…, /reels/…, /tv/…). */
export function instagramCode(raw: string): { kind: string; code: string } | undefined {
  try {
    const m = new URL(raw).pathname.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/)
    return m ? { kind: m[1] === 'reels' ? 'reel' : m[1], code: m[2] } : undefined
  } catch { return undefined }
}

const decode = (s: string) => s
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1]

/** The JSON object that starts right after `marker` in a page (balanced braces, strings respected). */
export function jsonAfter(html: string, marker: string): any {
  const at = html.indexOf(marker)
  if (at < 0) return undefined
  const start = html.indexOf('{', at + marker.length)
  if (start < 0) return undefined
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < html.length && i < start + 3_000_000; i++) {
    const c = html[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)) } catch { return undefined } }
  }
  return undefined
}

async function getText(url: string, extra: Record<string, string> = {}) {
  const res = await safeFetch(url, { headers: { ...HEADERS, ...extra }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { text: await res.text(), url: res.url || url }
}
async function getJson(url: string) { return JSON.parse((await getText(url)).text) }
const quiet = async <T>(p: Promise<T>): Promise<T | undefined> => { try { return await p } catch { return undefined } }

/** Subtitles (json3 or the older XML) as plain text. */
export function captionText(body: string): string {
  try {
    const j = JSON.parse(body)
    return (j.events ?? []).map((e: any) => (e.segs ?? []).map((s: any) => s.utf8 ?? '').join('')).join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  }
}

async function youtube(url: string): Promise<VideoText> {
  const id = youtubeId(url)
  if (!id) throw new Error('Nu recunosc linkul de YouTube.')
  const watch = `https://www.youtube.com/watch?v=${id}`
  const out: VideoText = { platform: 'youtube', url: watch, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  const [oembed, page] = await Promise.all([
    quiet(getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`)),
    // The EU consent page would come instead of the video page without this cookie.
    quiet(getText(`${watch}&hl=ro`, { Cookie: 'SOCS=CAI; CONSENT=YES+' })),
  ])
  out.title = oembed?.title
  out.author = oembed?.author_name
  if (page) {
    const player = jsonAfter(page.text, 'ytInitialPlayerResponse')
    const d = player?.videoDetails
    out.title ||= d?.title
    out.author ||= d?.author
    out.caption = d?.shortDescription || decode(meta(page.text, 'og:description') ?? '') || undefined
    // Subtitles: the video's own language first, then any (often automatic ones).
    const tracks: any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    const track = tracks.find((t) => t.kind !== 'asr') ?? tracks[0]
    if (track?.baseUrl) {
      const subs = await quiet(getText(`${track.baseUrl}&fmt=json3`))
      const said = subs ? captionText(subs.text) : ''
      if (said.length > 40) out.transcript = said.slice(0, MAX)
    }
  }
  if (!out.title && !out.caption) throw new Error('YouTube nu a lăsat videoclipul să fie citit.')
  return out
}

async function tiktok(url: string): Promise<VideoText> {
  // Short links (vm.tiktok.com/…) lead to the video's full address.
  let full = url
  if (!/\/video\/\d+/.test(url)) full = (await quiet(safeFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) })))?.url || url
  const o = await quiet(getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(full)}`))
  if (!o?.title && !o?.author_name) throw new Error('TikTok nu a lăsat videoclipul să fie citit.')
  return { platform: 'tiktok', url: full, title: undefined, author: o.author_name, caption: o.title, thumbnail: o.thumbnail_url }
}

/** The caption in Instagram's public embed page. */
export function instagramCaption(html: string): string | undefined {
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/)?.[1]
    ?? html.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1]
  if (!block) return undefined
  const text = decode(block
    .replace(/<a[^>]+class="CaptionUsername"[\s\S]*?<\/a>/, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
  return text || undefined
}

async function instagram(url: string): Promise<VideoText> {
  const post = instagramCode(url)
  if (!post) throw new Error('Nu recunosc linkul de Instagram. Deschide postarea și copiază linkul ei.')
  const link = `https://www.instagram.com/${post.kind}/${post.code}/`
  const out: VideoText = { platform: 'instagram', url: link }
  const embed = await quiet(getText(`${link}embed/captioned/`))
  if (embed) {
    out.caption = instagramCaption(embed.text)
    out.author = decode(embed.text.match(/class="UsernameText"[^>]*>([^<]+)</)?.[1] ?? '') || undefined
    const img = embed.text.match(/<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)?.[1]
    if (img) out.thumbnail = decode(img)
  }
  if (!out.caption) {
    const page = await quiet(getText(link))
    const desc = page && decode(meta(page.text, 'og:description') ?? meta(page.text, 'description') ?? '')
    // "123 likes, 4 comments - name on Date: "the caption"" → keep the caption.
    if (desc) out.caption = desc.replace(/^[\s\S]*?:\s*"/, '').replace(/"\.?\s*$/, '') || desc
    if (page && !out.thumbnail) out.thumbnail = decode(meta(page.text, 'og:image') ?? '') || undefined
  }
  if (!out.caption) throw new Error('Instagram nu lasă citirea postării. Deschide-o, copiază textul de sub video și lipește-l aici.')
  return out
}

/** The text of a video link, or undefined when the link is not a video platform. */
export async function videoText(url: string): Promise<VideoText | undefined> {
  const p = platformOf(url)
  if (p === 'youtube') return youtube(url)
  if (p === 'tiktok') return tiktok(url)
  if (p === 'instagram') return instagram(url)
  return undefined
}

/** What the model reads. */
export function videoSource(v: VideoText) {
  return [
    `Videoclip de pe ${PLATFORM_NAME[v.platform]}${v.author ? `, de la ${v.author}` : ''} (${v.url}).`,
    v.title && `Titlul: ${v.title}`,
    v.caption && `Descrierea sau textul de sub video:\n${v.caption.slice(0, MAX)}`,
    v.transcript && `Ce se spune în video (subtitrare, poate avea greșeli de recunoaștere):\n${v.transcript}`,
  ].filter(Boolean).join('\n\n')
}

export const VIDEO_RULES = `
Sursa e un videoclip scurt (YouTube, TikTok sau Instagram): ai titlul, descrierea și uneori ce se spune în video.
- Ignoră hashtagurile, emoji-urile, linkurile, „urmărește-mă”, codurile de reducere și reclamele.
- Dacă rețeta e doar spusă, ia-o din subtitrare; dacă e și scrisă, combină-le.
- Dacă lipsesc cantitățile, dar felul e clar, poți estima cantități obișnuite pentru o familie; atunci scrie în notes: „Cantitățile sunt estimate, videoclipul nu le spune.”
- Dacă ai doar numele preparatului și nicio indicație, pune title = "" și listele goale.`
