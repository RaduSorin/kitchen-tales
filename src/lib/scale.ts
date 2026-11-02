// Scales the leading quantity of an ingredient line, e.g. "500 g carne" × 1.5 → "750 g carne".
const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
const NICE: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']]

// Matches "1 1/2", "1/2", "1,5", "1.5", "2", "1½" or "½" at the start of the line.
const LEAD = /^\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:[.,]\d+)?)\s*([¼½¾⅓⅔])?|([¼½¾⅓⅔]))/

export function parseQuantity(line: string): { value: number; rest: string } | undefined {
  const m = LEAD.exec(line)
  if (!m) return undefined
  let value: number
  if (m[1]) value = +m[1] + +m[2] / +m[3]
  else if (m[4]) value = +m[4] / +m[5]
  else if (m[6]) value = parseFloat(m[6].replace(',', '.')) + (m[7] ? FRACTIONS[m[7]] : 0)
  else value = FRACTIONS[m[8]]
  if (!value || !isFinite(value)) return undefined
  return { value, rest: line.slice(m[0].length) }
}

export function formatQuantity(n: number): string {
  if (n >= 10) return String(Math.round(n))
  // Kitchen amounts below 10 read best in quarters: 1,1 → 1, 0,56 → ½.
  n = Math.max(0.25, Math.round(n * 4) / 4)
  const whole = Math.floor(n)
  const frac = n - whole
  for (const [v, s] of NICE) if (Math.abs(frac - v) < 0.04) return whole ? `${whole} ${s}` : s
  if (frac < 0.04) return String(whole)
  if (frac > 0.96) return String(whole + 1)
  return (Math.round(n * 10) / 10).toString().replace('.', ',')
}

export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const q = parseQuantity(line)
  if (!q) return line
  const rest = q.rest.startsWith(' ') || q.rest === '' ? q.rest : ' ' + q.rest
  return formatQuantity(q.value * factor) + rest
}
