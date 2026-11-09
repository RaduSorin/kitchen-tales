// Răgaz's vault: everything the person writes in Răgaz, kept on this phone in IndexedDB and
// encrypted with the data key (crypto.ts). One database per account (kt-mind-<userId>), so
// another account signed in on the same phone sees nothing of it.
//
// The vault is "locked" until Face ID or the backup code unwraps the data key; the key then
// lives in memory only. It locks again when the app has been in the background for a while or
// after 5 minutes without a tap.

import { useSyncExternalStore } from 'react'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { CODE_ITERATIONS, b64, keyFromCode, keyFromPrf, newDataKey, open, randomBytes, seal, unb64, unwrap, wrap, type Sealed } from './crypto'
import { passkeySecret, type PasskeyRef } from './passkey'
import { myUserId, onAccountChange, spaceReady } from '../space'

/** What unlocks the data key. Not secret: without Face ID or the code it opens nothing. */
export type VaultHeader = {
  v: 1
  createdAt: string
  code: { salt: string; iterations: number; wrapped: Sealed }
  passkey?: PasskeyRef & { wrapped: Sealed }
}

/** This phone's own choices about the vault (not personal, so not encrypted). */
export type VaultLocal = {
  /** Encrypted copy in the cloud after each change (on by default). */
  backup: boolean
  /** When the last copy reached the cloud (ms), and whether changes since then are waiting. */
  backupAt?: number
  pending?: boolean
  /** Reminders turned on from this phone, with their times (the server has the same). */
  reminders?: import('../../../amplify/shared/mindPush').Rhythms
}

type Item = { key: string; kind: string; updatedAt: number; sealed: Sealed }

interface MindDB extends DBSchema {
  meta: { key: 'header' | 'local'; value: VaultHeader | VaultLocal }
  items: { key: string; value: Item; indexes: { kind: string } }
}

export type VaultState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'locked'; header: VaultHeader }
  | { status: 'open'; header: VaultHeader }

let state: VaultState = { status: 'loading' }
let dek: CryptoKey | undefined
let dbFor: { user: string; db: Promise<IDBPDatabase<MindDB>> } | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const setState = (next: VaultState) => { state = next; emit() }

async function db() {
  const user = myUserId() ?? (await spaceReady())?.user ?? myUserId()
  if (!user) throw new Error('Nu ești conectat.')
  if (dbFor?.user !== user) {
    dbFor = {
      user,
      db: openDB<MindDB>(`kt-mind-${user}`, 1, {
        upgrade(d) {
          d.createObjectStore('meta')
          d.createObjectStore('items', { keyPath: 'key' }).createIndex('kind', 'kind')
        },
      }),
    }
  }
  return dbFor.db
}

let loading: Promise<VaultState> | undefined
/** Reads whether this phone has a vault for the signed-in account (once; later calls reuse it). */
export function loadVault() {
  return (loading ??= (async () => {
    try {
      const header = (await (await db()).get('meta', 'header')) as VaultHeader | undefined
      if (state.status === 'loading' || state.status === 'none') setState(header ? { status: dek ? 'open' : 'locked', header } : { status: 'none' })
    } catch {
      setState({ status: 'none' })
      loading = undefined
    }
    return state
  })())
}

export const getVault = () => state
export function useVault() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getVault)
}

// ---- unlocking ----

const DEFAULT_LOCAL: VaultLocal = { backup: true }
export async function getLocal(): Promise<VaultLocal> {
  return { ...DEFAULT_LOCAL, ...((await (await db()).get('meta', 'local')) as VaultLocal | undefined) }
}
export async function setLocal(patch: Partial<VaultLocal>) {
  const d = await db()
  await d.put('meta', { ...(await getLocal()), ...patch }, 'local')
  emit()
}

/** The data key from Face ID, for any header (this phone's, or one in a backup being restored). */
export async function keyWithFaceId(header: VaultHeader) {
  if (!header.passkey) throw new Error('Face ID nu e pornit pentru Răgaz.')
  const secret = await passkeySecret(header.passkey)
  if (!secret) throw new Error('Telefonul nu a dat cheia prin Face ID. Folosește codul.')
  return unwrap(header.passkey.wrapped, await keyFromPrf(secret))
}

/** The data key from the backup code; undefined when the code is wrong. */
export async function keyWithCode(header: VaultHeader, code: string) {
  try {
    return await unwrap(header.code.wrapped, await keyFromCode(code, unb64(header.code.salt), header.code.iterations))
  } catch {
    return undefined
  }
}

function opened(key: CryptoKey, header: VaultHeader) {
  dek = key
  touch()
  setState({ status: 'open', header })
}

export async function unlockWithFaceId() {
  if (state.status !== 'locked') return
  opened(await keyWithFaceId(state.header), state.header)
}

/** False when the code is wrong. */
export async function unlockWithCode(code: string) {
  if (state.status !== 'locked') return false
  const key = await keyWithCode(state.header, code)
  if (!key) return false
  opened(key, state.header)
  return true
}

export function lockVault() {
  dek = undefined
  if (state.status === 'open') setState({ status: 'locked', header: state.header })
}

// Locks after 5 minutes without a tap, and when the app comes back after 30 s in the background
// (a quick look at another app does not ask for Face ID again).
const IDLE_MS = 5 * 60_000
const AWAY_MS = 30_000
let lastTouch = Date.now()
let hiddenAt: number | undefined
const touch = () => { lastTouch = Date.now() }
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, touch, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return }
    if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) lockVault()
    hiddenAt = undefined
  })
  setInterval(() => { if (dek && Date.now() - lastTouch > IDLE_MS) lockVault() }, 15_000)
}
onAccountChange(() => { dek = undefined; dbFor = undefined; loading = undefined; setState({ status: 'loading' }) })

// ---- setting up and changing the keys ----

/** The backup code: digits only, at least six. */
export const MIN_CODE = 6
export const codeOk = (c: string) => /^\d+$/.test(c) && c.length >= MIN_CODE

const codeWrap = async (key: CryptoKey, code: string): Promise<VaultHeader['code']> => {
  const salt = randomBytes(16)
  return { salt: b64(salt), iterations: CODE_ITERATIONS, wrapped: await wrap(key, await keyFromCode(code, salt)) }
}

/** Creates the vault: a new data key, wrapped with the code and, when Face ID gave a secret, with the passkey. */
export async function createVault(code: string, passkey?: { ref: PasskeyRef; secret: ArrayBuffer }, local?: Partial<VaultLocal>) {
  const key = await newDataKey()
  const header: VaultHeader = {
    v: 1,
    createdAt: new Date().toISOString(),
    code: await codeWrap(key, code),
    passkey: passkey ? { ...passkey.ref, wrapped: await wrap(key, await keyFromPrf(passkey.secret)) } : undefined,
  }
  const d = await db()
  const tx = d.transaction(['meta', 'items'], 'readwrite')
  await tx.objectStore('items').clear()
  await tx.objectStore('meta').put(header, 'header')
  await tx.objectStore('meta').put({ ...DEFAULT_LOCAL, ...local }, 'local')
  await tx.done
  // Ask Safari not to clear the vault when space runs low (the Home Screen app is kept anyway).
  navigator.storage?.persist?.().catch(() => {})
  opened(key, header)
  changed()
}

async function saveHeader(header: VaultHeader) {
  await (await db()).put('meta', header, 'header')
  setState({ status: 'open', header })
  changed()
}

const needOpen = () => {
  if (!dek || state.status !== 'open') throw new Error('Răgaz e blocat.')
  return { key: dek, header: state.header }
}

export async function changeCode(code: string) {
  const { key, header } = needOpen()
  await saveHeader({ ...header, code: await codeWrap(key, code) })
}

/** Face ID for this vault (after a setup without it, or on a new phone): a new passkey and its wrap. */
export async function setPasskey(passkey: { ref: PasskeyRef; secret: ArrayBuffer } | undefined) {
  const { key, header } = needOpen()
  await saveHeader({ ...header, passkey: passkey ? { ...passkey.ref, wrapped: await wrap(key, await keyFromPrf(passkey.secret)) } : undefined })
}

// ---- reading and writing ----

const itemKey = (kind: string, id: string) => `${kind}:${id}`

export async function putItem<T>(kind: string, id: string, value: T) {
  const { key } = needOpen()
  await (await db()).put('items', { key: itemKey(kind, id), kind, updatedAt: Date.now(), sealed: await seal(key, value) })
  changed()
}

export async function getItem<T>(kind: string, id: string) {
  const { key } = needOpen()
  const item = await (await db()).get('items', itemKey(kind, id))
  return item ? open<T>(key, item.sealed) : undefined
}

export async function listItems<T>(kind: string) {
  const { key } = needOpen()
  const items = await (await db()).getAllFromIndex('items', 'kind', kind)
  return Promise.all(items.map(async (i) => ({ id: i.key.slice(kind.length + 1), updatedAt: i.updatedAt, value: await open<T>(key, i.sealed) })))
}

export async function removeItem(kind: string, id: string) {
  needOpen()
  await (await db()).delete('items', itemKey(kind, id))
  changed()
}

// ---- for backup.ts ----

/** Called after each change; backup.ts sends the encrypted copy a few seconds later. */
let onChange: (() => void) | undefined
export const setChangeHandler = (fn: () => void) => { onChange = fn }
function changed() { onChange?.() }

/** Everything in the vault as one encrypted payload, with the header that opens it. */
export async function snapshot(): Promise<{ header: VaultHeader; payload: Sealed }> {
  const { key, header } = needOpen()
  const items = await (await db()).getAll('items')
  return { header, payload: await seal(key, items) }
}

/** Replaces this phone's vault with a backup's, already opened with its data key. */
export async function restoreVault(header: VaultHeader, payload: Sealed, key: CryptoKey) {
  const items = await open<Item[]>(key, payload)
  const d = await db()
  const tx = d.transaction(['meta', 'items'], 'readwrite')
  const store = tx.objectStore('items')
  await store.clear()
  for (const item of items) await store.put(item)
  await tx.objectStore('meta').put(header, 'header')
  await tx.objectStore('meta').put({ ...DEFAULT_LOCAL, ...((await tx.objectStore('meta').get('local')) as VaultLocal | undefined), pending: false, backupAt: Date.now() }, 'local')
  await tx.done
  navigator.storage?.persist?.().catch(() => {})
  opened(key, header)
}

/** Deletes the vault from this phone (the cloud copy is backup.ts's job). */
export async function deleteVault() {
  const d = await db()
  const tx = d.transaction(['meta', 'items'], 'readwrite')
  await tx.objectStore('items').clear()
  await tx.objectStore('meta').clear()
  await tx.done
  dek = undefined
  setState({ status: 'none' })
}
