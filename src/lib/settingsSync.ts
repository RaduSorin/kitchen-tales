// Keeps the family's settings (child, city, kitchen tools) in the cloud as well as on the device.
// The device copy alone was lost whenever the phone cleared the site's storage (Safari does this
// after 7 days without a visit), and it was separate in Safari, the home-screen app and each
// device. Now: a change here is sent to the cloud (again later if offline), and on start the
// cloud copy wins, unless this device has a change it has not sent yet.
import { useEffect } from 'react'
import { getFamilySettings, saveFamilySettings } from './db'
import { applySharedSettings, getSettings, onSharedChange, type SharedSettings } from './settings'

const DIRTY_KEY = 'kt-settings-unsent'
// The family's settings as last agreed with the cloud: what this device changed is what differs from it.
const SYNCED_KEY = 'kt-settings-synced'
const FIELDS = ['child', 'city', 'kitchenTools', 'kid'] as const

const readSynced = (): SharedSettings | undefined => { try { return JSON.parse(localStorage.getItem(SYNCED_KEY) ?? 'null') ?? undefined } catch { return undefined } }
const writeSynced = (v: SharedSettings) => { try { localStorage.setItem(SYNCED_KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } }

const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1' } catch { return false } }
const setDirty = (on: boolean) => {
  try { if (on) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY) } catch { /* storage unavailable */ }
}

const shared = (): SharedSettings => {
  const { child, city, kitchenTools, kid } = getSettings()
  return { child, city, kitchenTools, kid }
}

/** Whether anything worth keeping was set on this device. */
const hasAny = (s: SharedSettings) =>
  !!(s.child.name.trim() || s.child.birthYear || s.child.gender || s.child.canRead || s.kitchenTools.length || s.kid.pinHash)

let version = 0
let timer: ReturnType<typeof setTimeout> | undefined
let busy: Promise<void> | undefined

/**
 * Sends this device's changes. Only the fields changed here are taken over the cloud copy, so
 * two phones editing different settings (one the child's name, the other the kitchen tools)
 * no longer overwrite each other; the other phone's changes come back to this one.
 */
async function push() {
  const v = version
  try {
    const local = shared()
    const base = readSynced()
    const changed = FIELDS.filter((f) => !base || JSON.stringify(local[f]) !== JSON.stringify(base[f]))
    const server = await getFamilySettings()
    const merged: SharedSettings = server
      ? { child: server.child, kitchenTools: server.kitchenTools, city: server.city ?? local.city, kid: server.kid ?? local.kid }
      : { ...local }
    for (const f of changed) (merged as Record<string, unknown>)[f] = local[f]
    await saveFamilySettings(merged)
    writeSynced(merged)
    if (v === version && JSON.stringify(merged) !== JSON.stringify(local)) applySharedSettings(merged)
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
      // Rows saved before kid mode existed have no kid fields: keep this device's copy then.
      if (server) {
        const next = { ...server, city: server.city ?? getSettings().city, kid: server.kid ?? getSettings().kid }
        applySharedSettings(next)
        writeSynced(shared())
      }
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
