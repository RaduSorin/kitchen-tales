// Turns pasted free text into a recipe draft.
// Recognises "Ingrediente" / "Mod de preparare" style headings (RO + EN).
export function parseRecipeText(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const title = lines.shift() ?? ''
  const ingredients: string[] = []
  const steps: string[] = []
  let mode: 'ing' | 'steps' | null = null
  const clean = (l: string) => l.replace(/^([-*•·]|\d+[.)])\s*/, '')
  for (const l of lines) {
    if (/^(ingrediente|ingredients)\b/i.test(l)) { mode = 'ing'; continue }
    if (/^(mod de preparare|preparare|instruc[tț]iuni|pa[sș]i|method|directions|instructions|steps)\b/i.test(l)) { mode = 'steps'; continue }
    if (mode === 'ing') ingredients.push(clean(l))
    else if (mode === 'steps') steps.push(clean(l))
    else if (/^([-*•·])/.test(l)) ingredients.push(clean(l))
    else steps.push(clean(l))
  }
  return { title, ingredients, steps }
}
