// Merges shopping list lines that ask for the same thing, so "2 cepe mari" (one recipe) and
// "1 ceapă" (another) show up as a single "3 cepe mari". Merging happens only on screen: the stored
// items stay one per recipe line, so removing a recipe's items or syncing keeps working as before.
import type { ShoppingItem } from './types'
import { formatQuantity, parseQuantity } from './scale'

export interface ShoppingRow {
  key: string
  text: string
  items: ShoppingItem[]
  /** Titles of the recipes the row comes from (empty for items typed by hand). */
  sources: string[]
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ş/g, 's').replace(/ţ/g, 't')

// Units: canonical key, how to convert to the base unit, and singular/plural for display.
interface Unit { key: string; base: string; factor: number; one: string; many: string }
const UNITS: [RegExp, Unit][] = [
  [/^(g|gr|grame?|gram)$/, { key: 'g', base: 'g', factor: 1, one: 'g', many: 'g' }],
  [/^(kg|kilograme?|kilogram)$/, { key: 'g', base: 'g', factor: 1000, one: 'kg', many: 'kg' }],
  [/^(ml|mililitri?|mililitru)$/, { key: 'ml', base: 'ml', factor: 1, one: 'ml', many: 'ml' }],
  [/^(l|litri?|litru)$/, { key: 'ml', base: 'ml', factor: 1000, one: 'l', many: 'l' }],
  [/^(lingura|linguri)$/, { key: 'lingura', base: 'lingura', factor: 1, one: 'lingură', many: 'linguri' }],
  [/^(lingurita|lingurite|lgt)$/, { key: 'lingurita', base: 'lingurita', factor: 1, one: 'linguriță', many: 'lingurițe' }],
  [/^(cana|cani)$/, { key: 'cana', base: 'cana', factor: 1, one: 'cană', many: 'căni' }],
  [/^(catel|catei)$/, { key: 'catel', base: 'catel', factor: 1, one: 'cățel', many: 'căței' }],
  [/^(buc|bucata|bucati)$/, { key: 'buc', base: 'buc', factor: 1, one: 'buc.', many: 'buc.' }],
  [/^(legatura|legaturi)$/, { key: 'legatura', base: 'legatura', factor: 1, one: 'legătură', many: 'legături' }],
  [/^(plic|plicuri)$/, { key: 'plic', base: 'plic', factor: 1, one: 'plic', many: 'plicuri' }],
  [/^(conserva|conserve)$/, { key: 'conserva', base: 'conserva', factor: 1, one: 'conservă', many: 'conserve' }],
]

// Words that describe size or state, not what to buy.
const SKIP = new Set(['mare', 'mari', 'mic', 'mica', 'mici', 'mediu', 'medie', 'medii', 'mijlociu', 'mijlocie', 'mijlocii',
  'proaspat', 'proaspata', 'proaspete', 'proaspeti', 'tocat', 'tocata', 'tocate', 'tocati', 'de', 'din', 'cu'])

// Plural forms that a simple ending cut does not bring back to the singular.
const IRREGULAR: Record<string, string> = { cepe: 'ceapa', oua: 'ou', mere: 'mar', pere: 'para', lamai: 'lamaie', nuci: 'nuca' }
const PLURAL: Record<string, string> = { ceapă: 'cepe', ou: 'ouă', măr: 'mere', pară: 'pere', lămâie: 'lămâi', ardei: 'ardei' }

const stem = (w: string) => (IRREGULAR[w] ?? w).replace(/(ii|ie|i|e|a|u)$/, '')

interface Parsed { name: string; nameKey: string; unit?: Unit; amount?: number }

function parse(text: string): Parsed {
  const q = parseQuantity(text)
  let rest = (q ? q.rest : text).trim()
  let unit: Unit | undefined
  const first = rest.split(/\s+/)[0] ?? ''
  if (q) {
    const u = UNITS.find(([re]) => re.test(plain(first).replace(/\.$/, '')))
    if (u) { unit = u[1]; rest = rest.slice(first.length).trim() }
  }
  const core = plain(rest).replace(/\(.*?\)/g, ' ').split(/[,;]/)[0]
  const words = core.split(/[^a-z0-9-]+/).filter((w) => w && !SKIP.has(w))
  return { name: rest, nameKey: words.map(stem).join(' '), unit, amount: q?.value }
}

function plural(name: string) {
  const [w, ...more] = name.split(' ')
  const p = PLURAL[w.toLowerCase()] ?? (/ă$/.test(w) ? w.slice(0, -1) + 'e' : /ie$/.test(w) ? w.slice(0, -1) + 'i' : /[^aeiouăâîi]$/i.test(w) ? w + 'i' : w)
  return [p, ...more].join(' ')
}

function amountText(total: number, unit: Unit | undefined) {
  if (!unit) return formatQuantity(total)
  if (unit.base === 'g' || unit.base === 'ml') {
    const big = unit.base === 'g' ? 'kg' : 'l'
    return total >= 1000 ? `${formatQuantity(total / 1000)} ${big}` : `${formatQuantity(total)} ${unit.base}`
  }
  return `${formatQuantity(total)} ${total > 1 ? unit.many : unit.one}`
}

/** Groups open shopping items that ask for the same ingredient, adding up their amounts. */
export function mergeShopping(items: ShoppingItem[]): ShoppingRow[] {
  const rows = new Map<string, { items: ShoppingItem[]; parsed: Parsed[] }>()
  for (const s of items) {
    const p = parse(s.text)
    // Lines without a clear name, or with an amount we cannot add up, stay on their own.
    const key = p.nameKey ? `${p.nameKey}|${p.amount === undefined ? '-' : p.unit?.key ?? '#'}` : `id:${s.id}`
    const row = rows.get(key) ?? { items: [], parsed: [] }
    row.items.push(s)
    row.parsed.push(p)
    rows.set(key, row)
  }
  return [...rows].map(([key, { items: xs, parsed }]) => {
    const sources = [...new Set(xs.map((s) => s.recipeTitle).filter((t): t is string => !!t))]
    if (xs.length === 1 || parsed[0].amount === undefined) return { key, text: xs[0].text, items: xs, sources }
    const unit = parsed[0].unit
    const total = parsed.reduce((n, p) => n + (p.amount ?? 0) * (p.unit?.factor ?? 1), 0)
    const shown = unit ? { ...unit, factor: 1 } : undefined
    // Name as written in the recipes: prefer a plural form when we need more than one.
    let name = parsed[0].name
    if (!unit) {
      const many = parsed.find((p) => (p.amount ?? 0) > 1)
      name = total > 1 ? (many ? many.name : plural(parsed[0].name)) : (parsed.find((p) => p.amount === 1)?.name ?? name)
    }
    return { key, text: `${amountText(total, shown)} ${name}`.trim(), items: xs, sources }
  })
}
