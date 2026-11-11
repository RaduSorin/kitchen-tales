// Moving Răgaz to Fallow, the separate iPhone app. Everything in the vault becomes one .fallow
// file, locked with a passphrase the person chooses, which Fallow opens on the iPhone.
//
// File: "FALLOWX1" | salt (16) | PBKDF2 rounds (uint32, big-endian) | nonce (12) | AES-GCM ciphertext + tag (16).
// Key: PBKDF2-HMAC-SHA256 of the passphrase (trimmed, NFC, UTF-8), 32 bytes.
// Inside: JSON { format: "fallow-vault", version: 1, exportedAt, contents } where contents has the
// shape of Fallow's VaultContents. Dates are ISO 8601 without milliseconds (Swift's .iso8601 reads
// only those). This must match fallow-ios Fallow/Backup/TransferFile.swift.
import type { Exercise, MonthPlan, Note } from './model'
import type { HerbBook } from './herbarium'
import type { Rhythms } from './push'

export const FALLOW_HEADER = 'FALLOWX1'
export const FALLOW_ROUNDS = 600_000
export const MIN_PASSPHRASE = 8

/** "2026-11-11T20:00:00Z" from ms or an ISO string. */
export const isoSeconds = (t: number | string) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>

/** A note after an exercise, the way the herbarium already reads it. */
const kindOf = (n: Note) => n.kind ?? (n.exerciseId || n.id.startsWith('fri-') ? 'friday' : 'free')

/** Fallow answers "Did you see the sign?" with yes / no. */
const answersOf = (a?: Record<string, string>) => {
  if (!a) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(a)) {
    if (!v?.trim()) continue
    out[k] = k === 'sign' ? (v === 'da' ? 'yes' : v === 'nu' ? 'no' : v) : v
  }
  return Object.keys(out).length ? out : undefined
}

export type RagazData = {
  createdAt: string | number
  exercises: (Exercise & { order?: number })[]
  months: MonthPlan[]
  notes: Note[]
  herb?: HerbBook
  rhythms?: Rhythms
}

/** Răgaz's vault in Fallow's shape. Pure, so it can be tested. */
export function toFallow(d: RagazData) {
  const friday = d.rhythms?.friday?.on ?? true
  const monday = d.rhythms?.monday?.on ?? true
  return {
    version: 1,
    createdAt: isoSeconds(d.createdAt),
    // Răgaz had no daily reminders, so morning and evening stay off.
    settings: { iCloudBackup: true, fridayReminder: friday, worryReminder: monday, reflectionReminder: monday },
    months: d.months.map((m) => ({
      ...clean({ id: m.id, intention: m.intention ?? '', success: m.success, target: m.target }),
      intention: m.intention ?? '',
      fridays: m.fridays.map((f) => ({ ...clean({ date: f.date, exerciseId: f.exerciseId }), title: f.title ?? '' })),
      savedAt: isoSeconds(m.savedAt || Date.now()),
    })),
    notes: d.notes.map((n) => ({
      ...clean({
        id: n.id, date: n.date, month: n.month || n.date.slice(0, 7), exerciseId: n.exerciseId, title: n.title,
        before: n.before, after: n.after, fit: n.fit,
      }),
      kind: kindOf(n),
      text: n.text ?? '',
      ...(answersOf(n.answers) ? { answers: answersOf(n.answers) } : {}),
      ...(n.worry ? { worry: { ...n.worry, stone: n.worry.stone ?? [], clay: n.worry.clay ?? [] } } : {}),
      createdAt: isoSeconds(n.createdAt || Date.now()),
    })),
    rhythms: [],
    rhythmLog: {},
    exercises: d.exercises.map((e) => ({
      ...clean({
        id: e.id, title: e.title, category: e.category, minutes: e.minutes,
        packId: e.packId, packTitle: e.packTitle, edited: e.edited, order: e.order,
      }),
      steps: e.steps ?? '',
    })),
    ...(d.herb ? {
      herbarium: {
        since: isoSeconds(d.herb.since),
        oldMonths: d.herb.oldMonths ?? [],
        oldExercises: d.herb.oldExercises ?? [],
        earned: Object.fromEntries(Object.entries(d.herb.earned ?? {}).map(([k, v]) => [k, isoSeconds(v)])),
        seen: d.herb.seen ?? [],
        ...(d.herb.lastVisit ? { lastVisit: d.herb.lastVisit } : {}),
        ...(d.herb.quiet ? { quiet: true } : {}),
      },
    } : {}),
  }
}

export const normalizePassphrase = (p: string) => p.trim().normalize('NFC')
export const passphraseOk = (p: string) => normalizePassphrase(p).length >= MIN_PASSPHRASE

async function keyFor(passphrase: string, salt: Uint8Array, rounds: number, use: KeyUsage[]) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, use)
}

/** The .fallow file's bytes. */
export async function sealFallow(contents: unknown, passphrase: string, rounds = FALLOW_ROUNDS, now = Date.now()) {
  if (!passphraseOk(passphrase)) throw new Error(`Parola trebuie să aibă cel puțin ${MIN_PASSPHRASE} caractere.`)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFor(passphrase, salt, rounds, ['encrypt'])
  const payload = { format: 'fallow-vault', version: 1, exportedAt: isoSeconds(now), contents }
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload))))
  const head = new TextEncoder().encode(FALLOW_HEADER)
  const out = new Uint8Array(head.length + 16 + 4 + 12 + sealed.length)
  out.set(head, 0)
  out.set(salt, head.length)
  new DataView(out.buffer).setUint32(head.length + 16, rounds)
  out.set(iv, head.length + 20)
  out.set(sealed, head.length + 32)
  return out
}

/** Opens a .fallow file (for tests, and to check a file before handing it over). */
export async function openFallow(bytes: Uint8Array, passphrase: string) {
  const head = new TextEncoder().encode(FALLOW_HEADER)
  if (bytes.length < head.length + 48 || !head.every((b, i) => bytes[i] === b)) throw new Error('Nu e un fișier Fallow.')
  const salt = bytes.slice(head.length, head.length + 16)
  const rounds = new DataView(bytes.buffer, bytes.byteOffset).getUint32(head.length + 16)
  const iv = bytes.slice(head.length + 20, head.length + 32)
  const key = await keyFor(passphrase, salt, rounds, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(head.length + 32))
  return JSON.parse(new TextDecoder().decode(plain)) as { format: string; version: number; exportedAt: string; contents: ReturnType<typeof toFallow> }
}
