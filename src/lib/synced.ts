// A small list that works offline: changes show at once, are kept on the device,
// and are sent to the cloud as soon as there is internet. Used for the week plan
// and the shopping list, which are often used in a shop with bad signal.
import { useEffect, useSyncExternalStore } from 'react'
import { onAccountChange, spaceReady } from './space'
import { showToast } from './toast'

type Op<T> = { kind: 'create' | 'update'; item: T; tries?: number } | { kind: 'delete'; id: string; tries?: number }

export interface Api<T> {
  list(): Promise<T[]>
  create(item: T): Promise<void>
  update(item: T): Promise<void>
  remove(id: string): Promise<void>
}

const read = <V>(key: string, fallback: V): V => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as V) : fallback } catch { return fallback }
}
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full or blocked */ } }

function applyOp<T extends { id: string }>(items: T[], op: Op<T>): T[] {
  if (op.kind === 'delete') return items.filter((x) => x.id !== op.id)
  const i = items.findIndex((x) => x.id === op.item.id)
  if (i < 0) return op.kind === 'create' ? [...items, op.item] : items
  const next = items.slice()
  next[i] = op.item
  return next
}

/** How often a change that could not reach the server is tried again while the app is open. */
const RETRY_MS = 15_000
/** How many times a change the server refuses is sent before it is given up. */
const MAX_REFUSED = 5

/** `label`: the list as named in a message ("lista de cumpărături"), when a change can't be saved. */
export function createSyncedList<T extends { id: string }>(name: string, api: Api<T>, label: string) {
  const itemsKey = `kt-${name}`
  const opsKey = `kt-${name}-pending`
  let items = read<T[]>(itemsKey, [])
  let ops = read<Op<T>[]>(opsKey, [])
  let loaded = false
  let flushing: Promise<void> | undefined
  const listeners = new Set<() => void>()

  const set = (next: T[]) => { items = next; write(itemsKey, items); listeners.forEach((fn) => fn()) }
  const saveOps = () => write(opsKey, ops)

  // Another account signed in on this device: the previous one's items and unsent changes go
  // (they must never be sent with the new account's sign-in, into its space).
  onAccountChange(() => { ops = []; loaded = false; set([]) })

  let retry: ReturnType<typeof setTimeout> | undefined
  const retryLater = () => { retry ??= setTimeout(() => { retry = undefined; flush() }, RETRY_MS) }

  async function flush() {
    if (flushing) return flushing
    flushing = (async () => {
      // Which account is signed in is settled first: a change left by another account is dropped then.
      await spaceReady()
      while (ops.length && navigator.onLine) {
        const op = ops[0]
        try {
          if (op.kind === 'delete') await api.remove(op.id)
          else if (op.kind === 'create') await api.create(op.item)
          else await api.update(op.item)
        } catch (err) {
          const refused = (err as Error | null)?.name === 'Rejected'
          if (!refused) {
            // Not reached (no signal, a shop with weak signal): never lost, tried again later.
            console.warn(`${name}: not sent yet`, err)
            retryLater()
            break
          }
          // Refused because it's already done (made before, the answer got lost) or the item is gone: nothing to do.
          if (!(err as { conditional?: boolean }).conditional) {
            op.tries = (op.tries ?? 0) + 1
            if (op.tries < MAX_REFUSED) { saveOps(); console.warn(`${name}: refused`, err); retryLater(); break }
            // The server keeps refusing it: give up, but say so.
            showToast(`Nu am putut salva o schimbare în ${label}. Încearcă din nou.`)
          }
        }
        ops.shift()
        saveOps()
      }
    })().finally(() => { flushing = undefined })
    return flushing
  }

  async function refresh() {
    await spaceReady()
    await flush()
    try {
      const server = await api.list()
      // Changes not sent yet still win over what the server has.
      set(ops.reduce(applyOp, server))
    } catch { /* offline: keep what is on the device */ }
    loaded = true
    listeners.forEach((fn) => fn())
  }

  function change(op: Op<T>) {
    ops.push(op)
    saveOps()
    set(applyOp(items, op))
    flush()
  }

  const onWake = () => { if (document.visibilityState === 'visible') refresh() }

  const store = {
    get: () => items,
    isLoaded: () => loaded,
    refresh,
    create: (item: T) => change({ kind: 'create', item }),
    update: (item: T) => change({ kind: 'update', item }),
    remove: (id: string) => change({ kind: 'delete', id }),
    subscribe(fn: () => void) {
      listeners.add(fn)
      if (listeners.size === 1) {
        window.addEventListener('online', refresh)
        document.addEventListener('visibilitychange', onWake)
      }
      return () => {
        listeners.delete(fn)
        if (!listeners.size) {
          window.removeEventListener('online', refresh)
          document.removeEventListener('visibilitychange', onWake)
        }
      }
    },
  }
  return store
}

export type SyncedList<T extends { id: string }> = ReturnType<typeof createSyncedList<T>>

/** The list's items; loads from the cloud the first time a screen uses it. */
export function useSyncedList<T extends { id: string }>(store: SyncedList<T>) {
  const items = useSyncExternalStore(store.subscribe, store.get)
  useEffect(() => { store.refresh() }, [store])
  return items
}
