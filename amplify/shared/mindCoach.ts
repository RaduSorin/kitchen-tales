// Răgaz's Claude: what the app sends to the mind-coach function (mutation mindCoach, input JSON).

export type CoachMessage = { role: 'user' | 'assistant'; text: string }

/**
 * Who is asking: Răgaz (Romanian, the default) or the Fallow iPhone app, which sends `app:
 * 'fallow'` and the language the person uses there.
 */
export type CoachFrom = { app?: 'ragaz' | 'fallow'; lang?: 'ro' | 'en' }

export type CoachInput = CoachFrom & (
  /** A chat turn: the recent conversation (last message is the person's), the note, and the context they allowed. */
  | { kind: 'chat'; messages: CoachMessage[]; note?: string; context?: string }
  /** End of a conversation: what to add to the note (Claude proposes, the person decides). */
  | { kind: 'remember'; messages: CoachMessage[]; note?: string }
  /** Friday themes for the month: picks from the person's bank. */
  | { kind: 'themes'; intention: string; fridays: string[]; bank: { title: string; category?: string }[] }
  /** The worry list: which items are stone and which clay, and a first small step. */
  | { kind: 'sort'; items: string[] }
)

export type CoachOutput =
  | { kind: 'chat'; text: string }
  | { kind: 'remember'; text: string }
  | { kind: 'themes'; picks: string[] }
  | { kind: 'sort'; stone: string[]; clay: string[]; step?: string }

export const MONTHLY_LIMIT = 200
export const MAX_MESSAGE = 4000
export const MAX_NOTE = 6000
export const mindUsagePath = (sub: string) => `mind/${sub}/usage.json`
