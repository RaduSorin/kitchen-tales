/** Lines that are headings ("Pentru sos:") rather than things to buy or tick. */
export const isHeading = (line: string) => /:\s*$/.test(line.trim())

// Scales the leading quantity of an ingredient line, e.g. "500 g carne" × 1.5 → "750 g carne".
const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
const NICE: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']]

// Matches "1 1/2", "1/2", "1,5", "1.5", "2", "1½" or "½" at the start of the line.
const LEAD = /^\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:[.,]\d+)?)\s*([¼½¾⅓⅔])?|([¼½¾⅓⅔]))/

// A range right after the first amount: "2-3", "2 – 3", "1,5-2".
const RANGE = /^\s*[-–]\s*(\d+(?:[.,]\d+)?)/

/** The amount at the start of a line; `max` is the upper end of a range like "2-3". */
export function parseQuantity(line: string): { value: number; max?: number; rest: string } | undefined {
  const m = LEAD.exec(line)
  if (!m) return undefined
  let value: number
  if (m[1]) value = +m[1] + +m[2] / +m[3]
  else if (m[4]) value = +m[4] / +m[5]
  else if (m[6]) value = parseFloat(m[6].replace(',', '.')) + (m[7] ? FRACTIONS[m[7]] : 0)
  else value = FRACTIONS[m[8]]
  if (!value || !isFinite(value)) return undefined
  const rest = line.slice(m[0].length)
  const r = RANGE.exec(rest)
  const max = r ? parseFloat(r[1].replace(',', '.')) : undefined
  if (!r) return { value, rest }
  // "3-2" is not an amount we understand (a code, a date): leave the line as it is.
  return max! > value ? { value, max, rest: rest.slice(r[0].length) } : undefined
}

export function formatQuantity(n: number): string {
  if (n >= 10) return String(Math.round(n))
  // Kitchen amounts below 10 read best in quarters or thirds: 1,1 → 1, 0,56 → ½, ⅔ × 4 → 2 ⅔.
  n = Math.max(0.25, n)
  let whole = Math.floor(n)
  let best: [number, string] = [0, '']
  for (const c of [[0, ''], [1, ''], ...NICE] as [number, string][]) if (Math.abs(n - whole - c[0]) < Math.abs(n - whole - best[0])) best = c
  if (best[0] === 1) { whole += 1; best = [0, ''] }
  if (!best[1]) return String(whole || 1)
  return whole ? `${whole} ${best[1]}` : best[1]
}

// Units that change with the amount: one form up to 1 (and "1 ½ cană"), the plural from 2 and for ranges ("1-2 căni").
const UNITS: [string, string][] = [
  ['cană', 'căni'], ['ceașcă', 'cești'], ['lingură', 'linguri'], ['linguriță', 'lingurițe'], ['pahar', 'pahare'],
  ['legătură', 'legături'], ['felie', 'felii'], ['bucată', 'bucăți'], ['cățel', 'căței'], ['conservă', 'conserve'],
  ['plic', 'plicuri'], ['pachet', 'pachete'], ['fir', 'fire'], ['frunză', 'frunze'], ['vârf', 'vârfuri'],
]

/** "3 cană" → "3 căni", "1 linguri" → "1 lingură"; "1000 g" → "1 kg", "1500 ml" → "1,5 l". */
function tidyUnit(amount: number, rest: string, range = false): { amount?: string; rest: string } {
  const m = /^(\s*)(\p{L}+)/u.exec(rest)
  if (!m) return { rest }
  const word = m[2]
  const after = rest.slice(m[0].length)
  const lower = word.toLowerCase()
  if ((lower === 'g' || lower === 'ml') && amount >= 1000) {
    const big = Math.round((amount / 1000) * 100) / 100
    return { amount: String(big).replace('.', ','), rest: `${m[1]}${lower === 'g' ? 'kg' : 'l'}${after}` }
  }
  for (const [one, many] of UNITS) {
    if (lower !== one && lower !== many) continue
    const want = amount >= 2 || (range && amount > 1) ? many : one
    return { rest: `${m[1]}${want}${after}` }
  }
  return { rest }
}

export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const q = parseQuantity(line)
  if (!q) return line
  let rest = q.rest.startsWith(' ') || q.rest === '' ? q.rest : ' ' + q.rest
  const lo = q.value * factor
  const hi = q.max ? q.max * factor : undefined
  const t = tidyUnit(hi ?? lo, rest, !!hi)
  rest = t.rest
  if (t.amount && !hi) return t.amount + rest
  if (t.amount && hi) return `${String(Math.round(lo / 10) / 100).replace('.', ',')}-${t.amount}` + rest
  const amount = hi ? `${formatQuantity(lo)}-${formatQuantity(hi)}` : formatQuantity(lo)
  return amount + rest
}
