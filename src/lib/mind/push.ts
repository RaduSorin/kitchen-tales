// Răgaz reminders on this phone: turning them on (permission + push subscription), the times, and
// telling the server the month's theme names. The server (functions/mind-push) only ever gets the
// times, the theme names and the subscriptions; see amplify/shared/mindPush.ts.

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../../amplify/data/resource'
import { DEFAULT_RHYTHMS, type PushSave, type Rhythms } from '../../../amplify/shared/mindPush'
import { askPermission, deviceId, pushProblem, subscription } from '../timerPush'
import { getLocal, setLocal } from './vault'
import type { MonthPlan } from './model'

const client = generateClient<Schema>()

export { pushProblem, DEFAULT_RHYTHMS }
export type { Rhythms }

async function call(op: 'save' | 'test' | 'status' | 'off', data?: PushSave) {
  const res = await client.mutations.mindPush({ op, data: data ? JSON.stringify(data) : null })
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
  return JSON.parse(res.data ?? '{}') as { devices?: number; sent?: number; rhythms?: Rhythms }
}

const fridaysOf = (m: MonthPlan) => ({ id: m.id, fridays: m.fridays.map((f) => ({ date: f.date, title: f.title })) })

/**
 * Turns reminders on for this phone with these times. Call straight from a tap: iOS asks for the
 * permission only then. False when the phone said no (or cannot get web push here).
 */
export async function enableReminders(rhythms: Rhythms) {
  if (!(await askPermission())) return false
  const device = { id: deviceId(), subscription: JSON.parse(await subscription()) }
  await call('save', { rhythms, device })
  await setLocal({ reminders: rhythms })
  return true
}

/** New times (or a rhythm on or off), for every phone of the person. */
export async function saveRhythms(rhythms: Rhythms) {
  await call('save', { rhythms })
  await setLocal({ reminders: rhythms })
}

/** The month's theme names, so Friday's reminder can say which one it is. Quiet when reminders are off. */
export async function syncMonth(m: MonthPlan) {
  if (!(await getLocal()).reminders) return
  await call('save', { month: fridaysOf(m) }).catch((e) => console.warn('ragaz reminders: month not sent', e))
}

export const sendTest = () => call('test')

/** This phone stops getting reminders (Răgaz turned off here); the others keep theirs. */
export async function removeThisPhone() {
  if (!(await getLocal()).reminders) return
  await call('save', { removeDevice: deviceId() }).catch(() => {})
}

/** No reminders anywhere: all schedules and the settings file go (Răgaz deleted). */
export const remindersOff = () => call('off').then(() => {}, () => {})
