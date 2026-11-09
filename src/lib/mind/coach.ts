// Răgaz's optional Claude. The conversation, the "Ce știe Claude despre mine" note and the
// settings live in the encrypted vault on the phone; each message goes to the mind-coach function
// (Bedrock), which keeps nothing. What leaves the phone is only what the person sends, plus the
// context level they chose (see contextText).

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../../amplify/data/resource'
import type { CoachInput, CoachMessage, CoachOutput } from '../../../amplify/shared/mindCoach'
import { getItem, putItem } from './vault'
import { getMonth, listNotes } from './store'
import { monthSummary } from './stats'
import { monthName, thisMonth } from './model'

const client = generateClient<Schema>()

export type { CoachMessage }
export type ChatMessage = CoachMessage & { at: number }
/** What Claude gets besides the conversation: nothing, the month's intention (default), or the intention and the month's numbers. */
export type ContextLevel = 'chat' | 'intention' | 'month'
export type CoachSettings = { consent?: boolean; level: ContextLevel }

const KIND = 'claude'
/** Messages kept on the phone, and how many recent ones go with each message. */
const KEEP = 300
const SEND = 24

export const getSettings = async (): Promise<CoachSettings> => ({ level: 'intention', ...(await getItem<CoachSettings>(KIND, 'settings')) })
export const saveSettings = (s: CoachSettings) => putItem(KIND, 'settings', s)
export const getNote = async () => (await getItem<{ text: string }>(KIND, 'note'))?.text ?? ''
export const saveNote = (text: string) => putItem(KIND, 'note', { text: text.slice(0, 6000) })
export const getChat = async () => (await getItem<ChatMessage[]>(KIND, 'chat')) ?? []
export const saveChat = (list: ChatMessage[]) => putItem(KIND, 'chat', list.slice(-KEEP))

async function call<T extends CoachOutput>(input: CoachInput): Promise<T> {
  const res = await client.mutations.mindCoach({ input: JSON.stringify(input) })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Claude nu răspunde acum.')
  return JSON.parse(res.data) as T
}

/** The context Claude gets for the chosen level: never the journal's text. */
export async function contextText(level: ContextLevel) {
  if (level === 'chat') return ''
  const id = thisMonth()
  const plan = await getMonth(id)
  const lines = [plan?.intention ? `Intenția pentru ${monthName(id)}: ${plan.intention}${plan.success ? ` (semnul: ${plan.success})` : ''}` : `Intenția pentru ${monthName(id)} nu e aleasă încă.`]
  if (level === 'month') {
    const s = monthSummary(plan, (await listNotes()).filter((n) => n.month === id))
    lines.push(`Vineri cu exercițiul făcut: ${s.done}${s.fridays ? ` din ${s.fridays}` : ''}.`)
    if (s.helped.length) lines.push(`A ajutat: ${s.helped.map((t) => `${t.title} (−${t.avgDrop})`).join(', ')}.`)
    if (s.poorFit.length) lines.push(`Nu s-a potrivit: ${s.poorFit.map((t) => t.title).join(', ')}.`)
  }
  return lines.join('\n')
}

/** Sends the person's message with the recent conversation; returns Claude's answer. */
export async function chat(history: ChatMessage[], level: ContextLevel) {
  const [note, context] = await Promise.all([getNote(), contextText(level)])
  const r = await call<{ kind: 'chat'; text: string }>({ kind: 'chat', messages: history.slice(-SEND).map(({ role, text }) => ({ role, text })), note, context })
  return r.text
}

/** What Claude proposes to add to the note after a conversation ('' when nothing new). */
export async function proposeMemory(history: ChatMessage[]) {
  const r = await call<{ kind: 'remember'; text: string }>({ kind: 'remember', messages: history.slice(-40).map(({ role, text }) => ({ role, text })), note: await getNote() })
  return r.text
}

export async function suggestThemes(intention: string, fridays: string[], bank: { title: string; category?: string }[]) {
  return (await call<{ kind: 'themes'; picks: string[] }>({ kind: 'themes', intention, fridays, bank })).picks
}

export async function sortWorries(items: string[]) {
  return call<{ kind: 'sort'; stone: string[]; clay: string[]; step?: string }>({ kind: 'sort', items })
}

// ---- import from claude.ai ----

/** The question to paste in the person's own claude.ai chat: a summary in a fixed format. */
export const IMPORT_PROMPT = `Te rog să rezumi ce știi despre mine din conversația noastră, pentru o aplicație de grijă de sine în care voi vorbi tot cu Claude. Scrie în română, scurt, exact cu titlurile de mai jos (fiecare pe rândul lui, cu ## în față), fără alte titluri:

## Despre mine
(câteva rânduri: ce contează pentru mine acum, fără detalii intime inutile)
## Stilul
(cum îmi place să vorbești cu mine)
## Unde am rămas
(ce lucram și pasul următor)
## Intenția
(intenția mea pentru luna asta, într-o propoziție, dacă am vorbit despre ea)
## Ce a funcționat
(exerciții sau obiceiuri care m-au ajutat)
## Emoții
(ce emoții apar des și ce le declanșează, pe scurt)`

const SECTIONS = ['Despre mine', 'Stilul', 'Unde am rămas', 'Intenția', 'Ce a funcționat', 'Emoții'] as const
export type ImportSection = (typeof SECTIONS)[number]

/** Splits the pasted summary by its titles. Text that matches no title is returned under "Despre mine". */
export function parseImport(text: string): Partial<Record<ImportSection, string>> {
  const out: Partial<Record<ImportSection, string>> = {}
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim()
  let current: ImportSection | undefined
  const loose: string[] = []
  for (const line of text.split('\n')) {
    const h = line.match(/^\s*#{1,4}\s*(.+?)\s*:?\s*$/) ?? line.match(/^\s*\*\*(.+?)\*\*\s*:?\s*$/)
    const hit = h && SECTIONS.find((s) => norm(s) === norm(h[1]))
    if (hit) { current = hit; continue }
    if (current) out[current] = `${out[current] ?? ''}${line}\n`
    else loose.push(line)
  }
  for (const k of Object.keys(out) as ImportSection[]) out[k] = out[k]!.trim()
  if (!Object.keys(out).length && loose.join('').trim()) out['Despre mine'] = loose.join('\n').trim()
  return out
}

/** The note from the imported sections (all but the intention). */
export const noteFromImport = (p: Partial<Record<ImportSection, string>>) =>
  SECTIONS.filter((s) => s !== 'Intenția' && p[s]).map((s) => `${s}:\n${p[s]}`).join('\n\n')
