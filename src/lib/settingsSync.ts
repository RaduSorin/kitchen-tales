// Keeps the family's settings (child, city, kitchen tools) in the cloud as well as on the device.
// The device copy alone was lost whenever the phone cleared the site's storage (Safari does this
// after 7 days without a visit), and it was separate in Safari, the home-screen app and each
// device. Now: a change here is sent to the cloud (again later if offline), and on start the
// cloud copy wins, unless this device has a change it has not sent yet.
import { useEffect } from 'react'
import { getFamilySettings, saveFamilySettings } from './db'
import { applySharedSettings, getSettings, onSharedChange, type SharedSettings } from './settings'

const DIRTY_KEY = 'kt-settings-unsent'

const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1' } catch { return false } }
const setDirty = (on: boolean) => {
  try { if (on) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY) } catch { /* storage unavailable */ }
}

const shared = (): SharedSettings => {
  const { child, city, kitchenTools } = getSettings()
  return { child, city, kitchenTools }
}

/** Whether anything worth keeping was set on this device. */
const hasAny = (s: SharedSettings) =>
  !!(s.child.name.trim() || s.child.birthYear || s.child.gender || s.child.canRead || s.kitchenTools.length)

let version = 0
let timer: ReturnType<typeof setTimeout> | undefined
let busy: Promise<void> | undefined

async function push() {
  const v = version
  try {
    await saveFamilySettings(shared())
    // Only clear the flag if nothing changed while it was being sent.
    if (v === version) setDirty(false)
  } catch (err) {
    console.warn('settings: sync failed', err)
  }
}

async function sync() {
  if (busy) return busy
  busy = (async () => {
    if (!navigator.onLine) return
    if (isDirty()) { await push(); if (isDirty()) return }
    try {
      const server = await getFamilySettings()
      if (isDirty()) return // changed on this device while loading: that change wins
      if (server) applySharedSettings({ ...server, city: server.city ?? getSettings().city })
      else if (hasAny(shared())) await push() // first time: keep what this device has
    } catch (err) {
      console.warn('settings: load failed', err)
    }
  })().finally(() => { busy = undefined })
  return busy
}

onSharedChange(() => {
  version++
  setDirty(true)
  // Wait for typing to stop before sending.
  clearTimeout(timer)
  timer = setTimeout(() => { if (navigator.onLine) push() }, 800)
})

/** Loads the family's settings from the cloud and keeps them in sync while the app is open. */
export function useSettingsSync() {
  useEffect(() => {
    sync()
    const onWake = () => { if (document.visibilityState === 'visible') sync() }
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [])
}
