// Răgaz backups. The vault (vault.ts) is encrypted on the phone before it leaves: the cloud copy
// and the exported file hold the same thing, the header (wrapped keys) and one encrypted payload.
// Without Face ID or the backup code neither the server nor anyone with the file can read it.
//
// The cloud copy (on by default) is replaced a few seconds after each change. It is what brings
// Răgaz back when Safari clears the phone's data, or on a new phone.

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../../amplify/data/resource'
import type { Sealed } from './crypto'
import { getLocal, getVault, restoreVault, setChangeHandler, setLocal, snapshot, type VaultHeader } from './vault'

const client = generateClient<Schema>()

export type Backup = { format: 'kt-ragaz'; v: 1; savedAt: string; header: VaultHeader; payload: Sealed }

async function link(op: 'read' | 'write' | 'delete') {
  const res = await client.mutations.mindBackup({ op })
  if (res.errors?.length || !res.data) throw new Error(res.errors?.map((e) => e.message).join('; ') || 'Copia din cloud nu răspunde.')
  return res.data
}

async function build(): Promise<Backup> {
  return { format: 'kt-ragaz', v: 1, savedAt: new Date().toISOString(), ...(await snapshot()) }
}

/** Reads a backup from text (cloud or file); throws when it is not one. */
export function parseBackup(text: string): Backup {
  let b: Partial<Backup> | undefined
  try { b = JSON.parse(text) as Partial<Backup> } catch { /* handled below */ }
  if (b?.format !== 'kt-ragaz' || b.v !== 1 || !b.header?.code || !b.payload) throw new Error('Fișierul nu e o copie Răgaz.')
  return b as Backup
}

// ---- the cloud copy ----

let timer: ReturnType<typeof setTimeout> | undefined
let sending: Promise<void> | undefined

/** Sends the encrypted copy now (also the "Fă o copie acum" button). */
export async function backupNow() {
  if (sending) await sending.catch(() => {})
  sending = (async () => {
    const { url } = await link('write')
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await build()) })
    if (!res.ok) throw new Error(`Copia nu a ajuns în cloud (${res.status}).`)
    await setLocal({ backupAt: Date.now(), pending: false })
  })()
  try { await sending } finally { sending = undefined }
}

// After each change: wait for a quiet moment (several notes in a row make one copy), then send.
// Offline or locked meanwhile, the copy waits (pending) and goes at the next change or unlock.
setChangeHandler(() => {
  getLocal().then((l) => {
    if (!l.backup) return
    if (!l.pending) setLocal({ pending: true }).catch(() => {})
    clearTimeout(timer)
    timer = setTimeout(() => { if (getVault().status === 'open') backupNow().catch(() => {}) }, 4000)
  }).catch(() => {})
})

/** A copy that waited (offline, app closed): sends it once the vault is open again. */
export async function flushPending() {
  const l = await getLocal()
  if (l.backup && l.pending && navigator.onLine && getVault().status === 'open') await backupNow().catch(() => {})
}

/** Whether the account has a cloud copy, and when it was saved. */
export async function cloudBackupInfo() {
  const r = await link('read')
  return { exists: r.exists, updatedAt: r.updatedAt ?? undefined }
}

export async function downloadCloudBackup() {
  const r = await link('read')
  if (!r.exists) throw new Error('Nu există nicio copie în cloud.')
  const res = await fetch(r.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Nu am putut descărca copia (${res.status}).`)
  return parseBackup(await res.text())
}

export const deleteCloudBackup = () => link('delete').then(() => {})

// ---- the file ----

/** The encrypted file to keep in iCloud Drive or anywhere: the share sheet on the phone, a download elsewhere. */
export async function exportBackup() {
  const name = `ragaz-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([JSON.stringify(await build())], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia Răgaz' })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Sharing refused: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Puts a backup on this phone, opened with its data key (keyWithFaceId / keyWithCode on its header). */
export async function restoreBackup(b: Backup, key: CryptoKey) {
  await restoreVault(b.header, b.payload, key)
}
