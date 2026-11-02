import { useEffect, useState } from 'react'
import { offlineStoryIds, onOfflineChange } from './offline'

// Ids of stories whose audio is saved on this device.
export function useOfflineIds() {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const load = () => offlineStoryIds().then(setIds).catch(() => {})
    load()
    return onOfflineChange(load)
  }, [])
  return ids
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}
