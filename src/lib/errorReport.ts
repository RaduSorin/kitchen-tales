// Error reports: when something breaks on a phone, the app sends what broke (page, message,
// stack, iOS version) to the client-log function, which writes it to CloudWatch. Reports wait on
// the phone while it is offline and go in small batches; the same error is sent once per app
// start with a count. Răgaz pages send only the error's name, never its message: what is written
// there stays on the phone.

import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../amplify/data/resource'

type Report = { at: string; kind: string; message: string; stack?: string; page: string; version: string; count: number }

const KEY = 'kt-error-reports'
const MAX_WAITING = 30
const MAX_PER_START = 50
const SEND_AFTER_MS = 3000

/** Noise the family cannot act on and the code cannot fix. */
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Network error|Load failed|The network connection was lost/i,
  /AbortError|The operation was aborted/i,
  /NotAllowedError.*play|play\(\) (request|failed)/i,
]

let client: ReturnType<typeof generateClient<Schema>> | undefined
const seen = new Map<string, Report>()
let sentThisStart = 0
let timer: ReturnType<typeof setTimeout> | undefined

const read = (): Report[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const write = (list: Report[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_WAITING))) } catch { /* storage unavailable */ } }

const version = () => {
  const ios = navigator.userAgent.match(/OS (\d+)_(\d+)/)
  const standalone = (navigator as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches
  return `${ios ? `iOS ${ios[1]}.${ios[2]}` : navigator.platform}${standalone ? ' app' : ' web'}`
}

/** Records an error to be sent. `kind` says where it was caught (window, promise, render, …). */
export function reportError(err: unknown, kind: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err)?.slice(0, 300) ?? String(err))
    const text = `${e.name}: ${e.message}`
    if (IGNORE.some((re) => re.test(text))) return
    const page = location.pathname
    const privatePage = page.startsWith('/ragaz') || page.startsWith('/profil/ragaz')
    const message = privatePage ? e.name : text.slice(0, 500)
    const key = `${kind}|${page}|${message}`
    const known = seen.get(key)
    if (known) { known.count++; return }
    if (sentThisStart >= MAX_PER_START) return
    sentThisStart++
    const report: Report = {
      at: new Date().toISOString(), kind, message, page, version: version(), count: 1,
      stack: privatePage ? undefined : e.stack?.split('\n').slice(0, 12).join('\n'),
    }
    seen.set(key, report)
    write([...read(), report])
    schedule()
  } catch { /* reporting must never break the app */ }
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => { timer = undefined; void send() }, SEND_AFTER_MS)
}

async function send() {
  const waiting = read()
  if (!waiting.length || !navigator.onLine) return
  // Counts that grew since a report was stored go with it.
  const list = waiting.map((r) => seen.get(`${r.kind}|${r.page}|${r.message}`) ?? r)
  try {
    client ??= generateClient<Schema>()
    const res = await client.mutations.reportErrors({ reports: JSON.stringify(list) })
    if (res.errors?.length) return
    write(read().filter((r) => !list.some((x) => x.at === r.at && x.message === r.message)))
  } catch { /* try again on the next error or when the signal comes back */ }
}

/** Starts listening for errors anywhere in the app; reports left from last time go too. */
export function watchForErrors() {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window'))
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'promise'))
  window.addEventListener('online', () => schedule())
  if (read().length) schedule()
}
