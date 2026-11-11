// Acasă › Azi when nothing is planned today: three dishes from the notebook, each with the reason
// it is suggested ("N-ai mai gătit-o de 7 săptămâni", "Favorită", "Gata în 20 min", "Încă negătită").
// Only data the app already has (cook log, favourites, minutes), so it works offline and without AI.
import type { Recipe, RecipeLog } from './types'
import { formatMinutes } from './format'

export type IdeaKind = 'demult' | 'favorita' | 'rapida' | 'noua'
export type TodayIdea = { r: Recipe; kind: IdeaKind; why: string; meta: string }

const DAY = 86_400_000
const daysBetween = (fromKey: string, to: Date) => {
  const [y, m, d] = fromKey.slice(0, 10).split('-').map(Number)
  return Math.round((to.getTime() - new Date(y, m - 1, d).getTime()) / DAY)
}
/** Romanian counts: "o săptămână" / "2 săptămâni" / "20 de săptămâni". */
export const count = (n: number, one: string, many: string) =>
  n === 1 ? one : `${n} ${n % 100 >= 20 || n % 100 === 0 ? 'de ' : ''}${many}`

/** "de 3 săptămâni", "de 2 luni", "de un an". */
export function sinceText(days: number) {
  const weeks = Math.floor(days / 7)
  if (weeks < 9) return `de ${count(weeks, 'o săptămână', 'săptămâni')}`
  const months = Math.floor(days / 30)
  if (months < 12) return `de ${count(months, 'o lună', 'luni')}`
  return `de ${count(Math.floor(days / 365), 'un an', 'ani')}`
}

const addedOn = (iso: string) => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })

/**
 * Up to three ideas, each from a different reason where the notebook allows it. `exclude` holds
 * the recipes already planned this week; nothing cooked in the last 7 days comes back, and the dish cooked longest ago leads its reason. `round`
 * is how many times "Alte idei" was tapped: each reason moves on to its next dish. After 17:00
 * the quick dish comes first.
 */
export function todayIdeas(recipes: Recipe[], logs: Map<string, RecipeLog>, exclude: Set<string>, now: Date, round = 0): TodayIdea[] {
  const items = recipes
    .filter((r) => r.mine !== false && !exclude.has(r.id))
    .map((r) => {
      const log = logs.get(r.id)
      const last = log?.cooked.at(-1)
      return { r, last, days: last ? daysBetween(last, now) : Infinity, times: log?.cooked.length ?? 0, fav: !!log?.favorite }
    })
    .filter((x) => x.days >= 7)
  const byTitle = (a: { r: Recipe }, b: { r: Recipe }) => a.r.title.localeCompare(b.r.title, 'ro')

  const pools: Record<IdeaKind, TodayIdea[]> = {
    demult: items.filter((x) => x.last).sort((a, b) => b.days - a.days || byTitle(a, b))
      .map((x) => ({ r: x.r, kind: 'demult', why: `N-ai mai gătit-o ${sinceText(x.days)}`, meta: [x.r.minutes && formatMinutes(x.r.minutes), x.r.servings && `${x.r.servings} porții`].filter(Boolean).join(' · ') })),
    favorita: items.filter((x) => x.fav && x.days >= 14).sort((a, b) => b.days - a.days || byTitle(a, b))
      .map((x) => ({ r: x.r, kind: 'favorita', why: x.r.minutes ? `Favorită · gata în ${formatMinutes(x.r.minutes)}` : 'Favorită', meta: x.times === 1 ? 'gătită o dată' : x.times ? `gătită de ${count(x.times, '', 'ori')}` : '' })),
    rapida: items.filter((x) => x.r.minutes && x.r.minutes <= 30).sort((a, b) => b.days - a.days || (a.r.minutes ?? 0) - (b.r.minutes ?? 0) || byTitle(a, b))
      .map((x) => ({ r: x.r, kind: 'rapida', why: `Gata în ${formatMinutes(x.r.minutes!)}`, meta: x.r.servings ? `${x.r.servings} porții` : '' })),
    noua: items.filter((x) => !x.last).sort((a, b) => (b.r.createdAt ?? '').localeCompare(a.r.createdAt ?? '') || byTitle(a, b))
      .map((x) => ({ r: x.r, kind: 'noua', why: 'Încă negătită', meta: [x.r.createdAt && `adăugată pe ${addedOn(x.r.createdAt)}`, x.r.minutes && formatMinutes(x.r.minutes)].filter(Boolean).join(' · ') })),
  }
  const order: IdeaKind[] = now.getHours() >= 17 ? ['rapida', 'demult', 'favorita', 'noua'] : ['demult', 'favorita', 'rapida', 'noua']
  const rotate = <T,>(a: T[]) => (a.length ? [...a.slice(round % a.length), ...a.slice(0, round % a.length)] : a)

  const picked: TodayIdea[] = []
  const has = (id: string) => picked.some((p) => p.r.id === id)
  // First one dish per reason, then fill up from the reasons that have more.
  for (let pass = 0; pass < 3; pass++) {
    for (const k of order) {
      if (picked.length >= 3) break
      if (pass === 0 && picked.some((p) => p.kind === k)) continue
      const next = rotate(pools[k]).find((x) => !has(x.r.id))
      if (next) picked.push(next)
    }
  }
  return picked
}
