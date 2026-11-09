// The month's summary for the reflection, computed on the phone from the structured part of the
// notes only (which exercise, intensity before → after, whether it fit). The free text is never read.

import type { MonthPlan, Note } from './model'

export type ToolStat = { title: string; times: number; avgDrop?: number; fits: { da: number; partial: number; nu: number } }

export type MonthSummary = {
  fridays: number
  done: number
  target?: number
  reached?: boolean
  tools: ToolStat[]
  /** Tools that helped most (biggest average drop, used at least once with both numbers). */
  helped: ToolStat[]
  /** Tools that fit poorly at least once. */
  poorFit: ToolStat[]
  worryLists: number
}

export function monthSummary(plan: MonthPlan | undefined, notes: Note[]): MonthSummary {
  const month = notes.filter((n) => n.kind !== 'reflection')
  const fridayNotes = month.filter((n) => n.exerciseId || n.kind === 'friday')
  const doneDates = new Set(fridayNotes.map((n) => n.date))
  const fridays = plan?.fridays.length ?? 0
  const done = plan ? plan.fridays.filter((f) => doneDates.has(f.date)).length : doneDates.size
  const byTool = new Map<string, ToolStat & { drops: number[] }>()
  for (const n of fridayNotes) {
    const key = n.title ?? n.exerciseId ?? '?'
    const t = byTool.get(key) ?? { title: key, times: 0, fits: { da: 0, partial: 0, nu: 0 }, drops: [] }
    t.times++
    if (n.fit) t.fits[n.fit]++
    if (n.before !== undefined && n.after !== undefined) t.drops.push(n.before - n.after)
    byTool.set(key, t)
  }
  const tools = [...byTool.values()].map(({ drops, ...t }) => ({ ...t, avgDrop: drops.length ? Math.round((drops.reduce((a, b) => a + b, 0) / drops.length) * 10) / 10 : undefined }))
  return {
    fridays,
    done,
    target: plan?.target,
    reached: plan?.target ? done >= plan.target : undefined,
    tools,
    helped: tools.filter((t) => (t.avgDrop ?? 0) > 0).sort((a, b) => (b.avgDrop ?? 0) - (a.avgDrop ?? 0)).slice(0, 3),
    poorFit: tools.filter((t) => t.fits.nu > 0),
    worryLists: month.filter((n) => n.kind === 'worry').length,
  }
}
