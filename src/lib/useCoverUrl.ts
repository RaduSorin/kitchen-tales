import { useEffect, useState } from 'react'
import { fileUrl } from './db'
import { getCover, saveCover } from './offline'

// A story cover from the device cache, or downloaded once from S3 and cached, so covers also show offline.
export function useCoverUrl(key?: string) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let live = true
    let objectUrl: string | undefined
    setUrl(undefined)
    if (!key) return
    ;(async () => {
      let blob = await getCover(key).catch(() => undefined)
      if (!blob) {
        const res = await fetch(await fileUrl(key))
        if (!res.ok) return
        blob = await res.blob()
        saveCover(key, blob).catch(() => {})
      }
      if (!live) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })().catch(() => {})
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [key])
  return url
}
