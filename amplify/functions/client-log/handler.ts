import { spaceOf } from '../../shared/spaces'

type Report = { at?: unknown; kind?: unknown; message?: unknown; stack?: unknown; page?: unknown; version?: unknown; count?: unknown }
type Event = { arguments: { reports: string }; identity?: { sub?: string; groups?: string[] | null } | null }

const MAX_REPORTS = 20
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined)

/** Writes each report as one JSON log line (search CloudWatch for "client-error"). */
export const handler = async (event: Event) => {
  let reports: Report[]
  try { reports = JSON.parse(event.arguments.reports ?? '[]') } catch { return 0 }
  if (!Array.isArray(reports)) return 0
  const who = { space: spaceOf(event.identity?.groups), user: event.identity?.sub?.slice(0, 8) }
  const list = reports.slice(0, MAX_REPORTS)
  for (const r of list) {
    console.log(JSON.stringify({
      type: 'client-error', ...who,
      at: clip(r.at, 30), kind: clip(r.kind, 30), page: clip(r.page, 200), version: clip(r.version, 40),
      count: typeof r.count === 'number' ? r.count : 1,
      message: clip(r.message, 500), stack: clip(r.stack, 2000),
    }))
  }
  return list.length
}
