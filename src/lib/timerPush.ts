// Cooking timers that reach you with the app closed: when a timer starts, the server schedules a
// push notification for its end time (amplify/functions/timer-alarm). iOS delivers web push only
// to the app added to the Home Screen (iOS 16.4+), after the user allows notifications.
import { cancelTimerAlarm, scheduleTimerAlarm } from './db'
import { VAPID_PUBLIC_KEY } from '../../amplify/shared/push'

const DEVICE_KEY = 'kt-device-id'

/** Why push can't be used here, or '' when it can (permission may still be needed). */
export function pushProblem(): '' | 'browser' | 'install' | 'denied' {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !installed ? 'install' : 'browser'
  if (Notification.permission === 'denied') return 'denied'
  return ''
}

/** This device's short id, so two phones cooking the same recipe keep separate alarms. */
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = crypto.randomUUID().slice(0, 8); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch { return 'dev' }
}

export const alarmId = (recipeId: string, step: number) => `kt-${deviceId()}-${recipeId}-${step}`.slice(0, 64)

/**
 * Asks for notification permission. Call it straight from a tap (iOS requires that) and before any
 * await. Resolves to true when notifications are allowed.
 */
export function askPermission(): Promise<boolean> {
  if (pushProblem()) return Promise.resolve(false)
  if (Notification.permission === 'granted') return Promise.resolve(true)
  return Notification.requestPermission().then((p) => p === 'granted').catch(() => false)
}

const keyBytes = (b64url: string) => {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function subscription() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
  return JSON.stringify(sub.toJSON())
}

/** Schedules the "timer done" notification. Never throws: the in-app alarm still works without it. */
export async function scheduleAlarm(id: string, endsAt: number, title: string, body: string, url: string) {
  try {
    if (!(await askPermission())) return false
    await scheduleTimerAlarm({ id, endsAt: new Date(endsAt).toISOString(), title, body, url, subscription: await subscription() })
    return true
  } catch (err) {
    console.warn('timer alarm: could not schedule', err)
    return false
  }
}

export function cancelAlarm(id: string) {
  if (pushProblem() || Notification.permission !== 'granted') return
  cancelTimerAlarm(id).catch((err) => console.warn('timer alarm: could not cancel', err))
}
