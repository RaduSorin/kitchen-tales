// The signed-in person's own name (Cognito "name" attribute), shown on the Profile tab and page.
// Kept on the device too, so the tab shows the right initial offline and right after opening.
import { useSyncExternalStore } from 'react'
import { fetchUserAttributes, updateUserAttributes } from 'aws-amplify/auth'
import { myEmail, spaceReady } from './space'

const KEY = 'kt-me-name' // a "kt-" key: dropped when another account signs in on this device
const listeners = new Set<() => void>()
let name = (() => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } })()

function set(next: string) {
  if (next === name) return
  name = next
  try { if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
  listeners.forEach((l) => l())
}

let loading: Promise<void> | undefined
/** Reads the name from the account once per app start. */
export function loadMyName() {
  return (loading ??= spaceReady()
    .then(() => fetchUserAttributes())
    .then((a) => set(a.name?.trim() ?? ''))
    .catch(() => { loading = undefined }))
}

export async function saveMyName(next: string) {
  const v = next.trim().slice(0, 40)
  await updateUserAttributes({ userAttributes: { name: v } })
  set(v)
}

export function useMyName() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => name)
}

/** One letter for the avatar: from the name, else from the email. */
export const initialOf = (n: string) => (n.trim() || myEmail() || '?').charAt(0).toUpperCase()
