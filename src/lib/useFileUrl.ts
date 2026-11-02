import { useEffect, useState } from 'react'
import { fileUrl } from './db'

// Signed S3 URL for a stored file (photo or audio).
export function useFileUrl(path?: string) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let live = true
    setUrl(undefined)
    if (path) fileUrl(path).then((u) => live && setUrl(u)).catch(() => {})
    return () => { live = false }
  }, [path])
  return url
}
