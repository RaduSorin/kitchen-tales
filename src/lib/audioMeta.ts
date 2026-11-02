// Reads the tags inside an audio file: title, artist, album and the embedded cover picture.
// Supports ID3v2.2/2.3/2.4 (MP3) and iTunes-style MP4 tags (M4A/AAC). No dependencies.

export interface AudioMeta {
  title?: string
  artist?: string
  album?: string
  picture?: Blob
}

export async function readAudioMeta(file: Blob): Promise<AudioMeta> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (ascii(head, 0, 3) === 'ID3') return await readId3(file, head)
    if (ascii(head, 4, 8) === 'ftyp') return await readMp4(file)
  } catch { /* damaged or unusual tags: treat as untagged */ }
  return {}
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
const syncsafe = (b: Uint8Array, i: number) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f)
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const clean = (s?: string) => s?.replace(/\0+$/, '').trim() || undefined

/** Removes ID3 "unsynchronisation" bytes (every FF 00 becomes FF). */
function unsync(b: Uint8Array) {
  const out = new Uint8Array(b.length)
  let n = 0
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i]
    if (b[i] === 0xff && b[i + 1] === 0) i++
  }
  return out.subarray(0, n)
}

function decodeText(enc: number, b: Uint8Array) {
  const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1'
  return new TextDecoder(label).decode(b)
}

/** Index just past the null terminator of a string in the given encoding. */
function skipString(b: Uint8Array, i: number, enc: number) {
  if (enc === 1 || enc === 2) {
    while (i + 1 < b.length && (b[i] || b[i + 1])) i += 2
    return i + 2
  }
  while (i < b.length && b[i]) i++
  return i + 1
}

const IMAGE_MIME: Record<string, string> = { JPG: 'image/jpeg', PNG: 'image/png' }

async function readId3(file: Blob, head: Uint8Array): Promise<AudioMeta> {
  const ver = head[3]
  const flags = head[5]
  const size = syncsafe(head, 6)
  let tag = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer())
  if (ver < 4 && flags & 0x80) tag = unsync(tag)
  let pos = 0
  if (flags & 0x40) pos = ver === 4 ? syncsafe(tag, 0) : be32(tag, 0) + 4 // extended header

  const meta: AudioMeta = {}
  let cover: { type: number; blob: Blob } | undefined
  const idLen = ver === 2 ? 3 : 4
  const hdrLen = ver === 2 ? 6 : 10
  while (pos + hdrLen <= tag.length) {
    const id = ascii(tag, pos, pos + idLen)
    if (!/^[A-Z0-9]+$/.test(id)) break // padding
    const len = ver === 2 ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5] : ver === 4 ? syncsafe(tag, pos + 4) : be32(tag, pos + 4)
    const fmt = ver === 2 ? 0 : tag[pos + 9]
    let body = tag.subarray(pos + hdrLen, pos + hdrLen + len)
    pos += hdrLen + len
    if (ver === 4) {
      if (fmt & 0x0c) continue // compressed or encrypted
      if (fmt & 0x01) body = body.subarray(4) // data length indicator
      if (fmt & 0x02) body = unsync(body)
    } else if (ver === 3 && fmt & 0xc0) continue
    if (!body.length) continue

    if (id === 'TIT2' || id === 'TT2') meta.title = clean(decodeText(body[0], body.subarray(1)))
    else if (id === 'TPE1' || id === 'TP1') meta.artist = clean(decodeText(body[0], body.subarray(1)))
    else if (id === 'TALB' || id === 'TAL') meta.album = clean(decodeText(body[0], body.subarray(1)))
    else if (id === 'APIC' || id === 'PIC') {
      const enc = body[0]
      let i = 1
      let mime: string
      if (id === 'PIC') { mime = IMAGE_MIME[ascii(body, 1, 4).toUpperCase()] ?? 'image/jpeg'; i = 4 }
      else { const end = skipString(body, 1, 0); mime = ascii(body, 1, end - 1) || 'image/jpeg'; i = end }
      if (!mime.includes('/')) mime = `image/${mime.toLowerCase()}`
      const type = body[i]
      i = skipString(body, i + 1, enc)
      // Prefer the front cover (type 3); otherwise keep the first picture.
      if (i < body.length && (!cover || (type === 3 && cover.type !== 3))) cover = { type, blob: new Blob([body.slice(i)], { type: mime }) }
    }
  }
  meta.picture = cover?.blob
  return meta
}

// ---- MP4 / M4A ----

type Atom = { type: string; start: number; body: number; end: number }

async function topLevelAtoms(file: Blob) {
  const atoms: Atom[] = []
  let pos = 0
  while (pos + 8 <= file.size && atoms.length < 64) {
    const h = new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer())
    let size = be32(h, 0)
    let body = pos + 8
    if (size === 1) { size = be32(h, 8) * 2 ** 32 + be32(h, 12); body = pos + 16 }
    else if (size === 0) size = file.size - pos
    if (size < 8) break
    atoms.push({ type: ascii(h, 4, 8), start: pos, body, end: pos + size })
    pos += size
  }
  return atoms
}

function children(b: Uint8Array, from: number, to: number) {
  const out: Atom[] = []
  let pos = from
  while (pos + 8 <= to) {
    const size = be32(b, pos)
    if (size < 8 || pos + size > to) break
    out.push({ type: ascii(b, pos + 4, pos + 8), start: pos, body: pos + 8, end: pos + size })
    pos += size
  }
  return out
}

const child = (b: Uint8Array, a: Atom | undefined, type: string) => (a ? children(b, a.body, a.end).find((c) => c.type === type) : undefined)

async function readMp4(file: Blob): Promise<AudioMeta> {
  const moovAtom = (await topLevelAtoms(file)).find((a) => a.type === 'moov')
  if (!moovAtom || moovAtom.end - moovAtom.start > 64 * 2 ** 20) return {}
  const b = new Uint8Array(await file.slice(moovAtom.start, moovAtom.end).arrayBuffer())
  const moov = { ...moovAtom, start: 0, body: moovAtom.body - moovAtom.start, end: b.length }
  const meta = child(b, child(b, moov, 'udta'), 'meta')
  if (!meta) return {}
  // "meta" is usually a full box (4 extra bytes of version/flags) but not always.
  const metaBody = ascii(b, meta.body + 4, meta.body + 8) === 'hdlr' ? meta.body : meta.body + 4
  const ilst = children(b, metaBody, meta.end).find((c) => c.type === 'ilst')
  if (!ilst) return {}

  const out: AudioMeta = {}
  for (const item of children(b, ilst.body, ilst.end)) {
    const data = child(b, item, 'data')
    if (!data) continue
    const kind = be32(b, data.body) & 0xffffff
    const payload = b.subarray(data.body + 8, data.end)
    const text = () => clean(new TextDecoder().decode(payload))
    if (item.type === '©nam') out.title = text()
    else if (item.type === '©ART' || (item.type === 'aART' && !out.artist)) out.artist = text()
    else if (item.type === '©alb') out.album = text()
    else if (item.type === 'covr' && !out.picture) out.picture = new Blob([payload.slice()], { type: kind === 14 ? 'image/png' : 'image/jpeg' })
  }
  return out
}
