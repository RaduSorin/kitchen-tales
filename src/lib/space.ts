// Which space (household) the signed-in account belongs to, from the Cognito groups in its
// token (see amplify/shared/spaces.ts). Kept on the device too, so it is known offline.
import { fetchAuthSession } from 'aws-amplify/auth'
import { ADMINS, EVERYONE, spaceOf } from '../../amplify/shared/spaces'
import { cacheList } from './offline'

type Info = { user: string; space?: string; admin: boolean }

const KEY = 'kt-space'
// Device copies that belong to whoever was signed in; cleared when another account signs in here.
const KEEP = new Set([KEY, 'kt-settings'])

let info: Info | undefined = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined } catch { return undefined }
})()

async function readToken(forceRefresh: boolean): Promise<Info | undefined> {
  const { tokens } = await fetchAuthSession({ forceRefresh })
  const p = tokens?.accessToken.payload
  if (!p?.sub) return undefined
  const groups = (p['cognito:groups'] as string[] | undefined) ?? []
  return { user: String(p.sub), space: spaceOf(groups), admin: groups.includes(ADMINS) }
}

/** A different account signed in on this device: drop the previous account's lists. */
async function forgetPreviousAccount() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('kt-') && !KEEP.has(k)) localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
  await Promise.all([cacheList('stories', []), cacheList('recipes', [])]).catch(() => {})
}

async function load(): Promise<Info | undefined> {
  try {
    let next = await readToken(false)
    // A token from before the account was put in a space has no groups: get a fresh one once.
    if (next && !next.space) next = (await readToken(true).catch(() => undefined)) ?? next
    if (next) {
      if (info && info.user !== next.user) await forgetPreviousAccount()
      info = next
      try { localStorage.setItem(KEY, JSON.stringify(info)) } catch { /* storage unavailable */ }
    }
  } catch { /* offline: keep what this device knew */ }
  return info
}

let loading: Promise<Info | undefined> | undefined
/** Loads the account's space once per app start (called before the first cloud request). */
export const spaceReady = () => (loading ??= load())

/** The space group of the signed-in account; new rows are created in it. */
export async function mySpaceGroup(): Promise<string> {
  const s = (await spaceReady())?.space
  if (!s) throw new Error('Contul tău nu are încă un spațiu. Ieși din cont și conectează-te din nou.')
  return s
}

/** Whether a row belongs to the signed-in account's space (false for something another space shared). */
export const isMine = (spaceGroups?: (string | null)[] | null) => !!info?.space && !!spaceGroups?.includes(info.space)

/** Whether a row is shared with every account. */
export const isShared = (readerGroups?: (string | null)[] | null) => !!readerGroups?.includes(EVERYONE)

export const readerGroupsFor = (shared: boolean) => (shared ? [EVERYONE] : [])

/** Admins (Sorin) see the accounts and send invitations. */
export const isAdmin = () => !!info?.admin
