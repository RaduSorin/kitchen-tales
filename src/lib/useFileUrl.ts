import { useEffect, useState } from 'react'
import { fileUrl } from './db'
import { getPhoto, savePhoto } from './offline'

// A photo's path never changes its picture (a new photo gets a new path), so each one is
// downloaded once, kept on this device (it also shows offline) and shared by every screen.
const shown = new Map<string, string>()
const loading = new Map<string, Promise<string>>()

async function resolve(path: string) {
  const cached = await getPhoto(path).catch(() => undefined)
  if (cached) return URL.createObjectURL(cached)
  const signed = await fileUrl(path)
  try {
    const res = await fetch(signed)
    if (!res.ok) return signed
    const blob = await res.blob()
    savePhoto(path, blob).catch(() => {})
    return URL.createObjectURL(blob)
  } catch {
    // Could not download it here (e.g. blocked): the signed link still shows it while online.
    return signed
  }
}

function photoUrl(path: string) {
  let p = loading.get(path)
  if (!p) {
    p = resolve(path).then((u) => { if (u.startsWith('blob:')) shown.set(path, u); return u })
    p.catch(() => {}).finally(() => loading.delete(path))
    loading.set(path, p)
  }
  return p
}

// A stored photo (recipe or step) to show: from memory, from this device, or downloaded once.
export function useFileUrl(path?: string) {
  const [url, setUrl] = useState<string | undefined>(() => (path ? shown.get(path) : undefined))
  useEffect(() => {
    let live = true
    if (!path) { setUrl(undefined); return }
    const known = shown.get(path)
    if (known) { setUrl(known); return }
    setUrl(undefined)
    photoUrl(path).then((u) => live && setUrl(u)).catch(() => {})
    return () => { live = false }
  }, [path])
  return url
}

/** Downloads photos ahead (one at a time), e.g. a recipe's step photos so cooking mode has them offline. */
export async function keepPhotos(paths: (string | undefined)[]) {
  for (const p of paths) {
    if (!p || shown.has(p) || !navigator.onLine) continue
    await photoUrl(p).catch(() => {})
  }
}

/** A stored photo's bytes: from this device when it has them, otherwise downloaded (and kept). */
export async function photoBlob(path: string): Promise<Blob> {
  const cached = await getPhoto(path).catch(() => undefined)
  if (cached) return cached
  const res = await fetch(await fileUrl(path))
  if (!res.ok) throw new Error(`photo ${res.status}`)
  const blob = await res.blob()
  savePhoto(path, blob).catch(() => {})
  return blob
}
