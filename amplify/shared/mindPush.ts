// Răgaz reminders: what the app sends to the mind-push function (mutation mindPush) and what the
// function keeps in mind/<sub>/push.json. Only times, theme names and push subscriptions.

export type Rhythm = 'friday' | 'monday'
export type RhythmSetting = { on: boolean; time: string /* HH:MM, Europe/Bucharest */ }
export type Rhythms = Record<Rhythm, RhythmSetting>

export const DEFAULT_RHYTHMS: Rhythms = {
  // The week's theme, Friday evening.
  friday: { on: true, time: '20:00' },
  // The worry list (and, the first Monday of the month, the monthly reflection). Its screens come
  // with the next step of the plan, so it starts off.
  monday: { on: false, time: '08:30' },
}

export const RHYTHM_DAY: Record<Rhythm, string> = { friday: 'FRI', monday: 'MON' }

export type PushState = {
  rhythms: Rhythms
  /** "2026-12" → the Fridays and their theme names. */
  months: Record<string, { date: string; title: string }[]>
  /** One push subscription per phone (JSON from PushSubscription.toJSON()). */
  devices: Record<string, { endpoint: string; keys: { p256dh: string; auth: string } }>
  updatedAt?: string
}

/** What the app may send with op "save" (each part optional). */
export type PushSave = {
  rhythms?: Rhythms
  month?: { id: string; fridays: { date: string; title: string }[] }
  device?: { id: string; subscription: PushState['devices'][string] }
  /** This phone turned notifications off. */
  removeDevice?: string
}

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const mindPushPath = (sub: string) => `mind/${sub}/push.json`
