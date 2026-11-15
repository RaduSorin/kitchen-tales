// Turns pasted free text into a recipe draft.
// Recognises "Ingrediente" / "Mod de preparare" style headings (RO + EN), and "Porții: 4" /
// "Timp: 1 h 30 min" lines, which fill the recipe's servings and time instead of becoming steps.

/** "Porții: 4", "Pentru 4 persoane", "Servings: 4" → 4. */
export function servingsOf(line: string): number | undefined {
  const m = /^(?:por[tțţ]ii|servings|serves|yield)\s*[:\-–]?\s*(\d{1,2})\b/i.exec(line) ?? /^pentru\s+(\d{1,2})\s+(?:persoane|por[tțţ]ii)\b/i.exec(line)
  return m ? +m[1] : undefined
}

/** "Timp: 30 min", "Timp total: 1 h 30 min", "Timp de preparare: 1 oră", "Total time: 45 minutes" → minutes. */
export function minutesOf(line: string): number | undefined {
  const m = /^(?:timp(?:\s+(?:total|de\s+preparare|de\s+gătire|de\s+gatire))?|durat[aă]|(?:total\s+|prep\s+|cook\s+)?time)\s*[:\-–]?\s*(.+)$/i.exec(line)
  if (!m) return undefined
  const t = m[1].toLowerCase()
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h|ore|oră|ora|hours?|hrs?)(?!\p{L})/u.exec(t)
  const min = /(\d+)\s*(?:min|minute|minut|minutes|mins?)(?!\p{L})/u.exec(t)
  if (!h && !min) return undefined
  const total = (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (min ? +min[1] : 0)
  return total > 0 ? Math.round(total) : undefined
}

export function parseRecipeText(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const title = lines.shift() ?? ''
  const ingredients: string[] = []
  const steps: string[] = []
  let mode: 'ing' | 'steps' | null = null
  let servings: number | undefined
  let minutes: number | undefined
  const clean = (l: string) => l.replace(/^([-*•·]|\d+[.)])\s*/, '')
  for (const l of lines) {
    const s = servingsOf(clean(l))
    if (s && !servings) { servings = s; continue }
    const t = minutesOf(clean(l))
    if (t && !minutes) { minutes = t; continue }
    if (/^(ingrediente|ingredients)\b/i.test(l)) { mode = 'ing'; continue }
    if (/^(mod de preparare|preparare|instruc[tț]iuni|pa[sș]i|method|directions|instructions|steps)\b/i.test(l)) { mode = 'steps'; continue }
    if (mode === 'ing') ingredients.push(clean(l))
    else if (mode === 'steps') steps.push(clean(l))
    else if (/^([-*•·])/.test(l)) ingredients.push(clean(l))
    else steps.push(clean(l))
  }
  return { title, ingredients, steps, ...(servings ? { servings } : {}), ...(minutes ? { minutes } : {}) }
}
