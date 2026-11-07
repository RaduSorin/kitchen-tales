// What the family doesn't eat, and what a recipe has in it (values per serving, allergens).
// The recipe facts are estimated by AI from the ingredients (amplify/functions/import-recipe).

/** Keys match ALLERGENS in amplify/functions/import-recipe/handler.ts. */
export const DIET_ITEMS: { key: string; label: string; short: string }[] = [
  { key: 'lactoza', label: 'lactoză', short: 'lactoză' },
  { key: 'nuci', label: 'nuci', short: 'nuci' },
  { key: 'gluten', label: 'gluten', short: 'gluten' },
  { key: 'oua', label: 'ouă', short: 'ouă' },
  { key: 'arahide', label: 'arahide', short: 'arahide' },
  { key: 'peste', label: 'pește', short: 'pește' },
  { key: 'crustacee', label: 'crustacee', short: 'crustacee' },
  { key: 'soia', label: 'soia', short: 'soia' },
  { key: 'susan', label: 'susan', short: 'susan' },
  { key: 'telina', label: 'țelină', short: 'țelină' },
  { key: 'mustar', label: 'muștar', short: 'muștar' },
  { key: 'porc', label: 'carne de porc', short: 'porc' },
  { key: 'carne', label: 'carne (vegetarian)', short: 'carne' },
]
const OTHER: Record<string, string> = { sulfiti: 'sulfiți', lupin: 'lupin', moluste: 'moluște' }
export const allergenLabel = (key: string) => DIET_ITEMS.find((d) => d.key === key)?.short ?? OTHER[key] ?? key
/** Every allergen the facts can name (the 14 on EU food labels), for "doesn't contain". */
export const EU_ALLERGENS = ['gluten', 'crustacee', 'oua', 'peste', 'arahide', 'soia', 'lactoza', 'nuci', 'telina', 'mustar', 'susan', 'sulfiti', 'lupin', 'moluste']

/** One thing the family avoids: `strict` = an allergy (never in a dish), else "we avoid it" (swap it). */
export interface DietRule { key: string; strict: boolean; who?: string }
export interface Diet { avoid: DietRule[]; dislikes: string }
export const NO_DIET: Diet = { avoid: [], dislikes: '' }

export interface Nutrition { kcal: number; protein: number; carbs: number; fat: number; fiber?: number; sugar?: number; salt?: number }
export interface AllergenHit { key: string; from: string[] }

export const hasDiet = (d: Diet) => d.avoid.length > 0 || !!d.dislikes.trim()

/** The diet in words, for the AI ("alergie: nuci (Tibi); evităm: lactoză; nu ne plac: ciuperci"). */
export function dietText(d: Diet) {
  const item = (r: DietRule) => `${DIET_ITEMS.find((x) => x.key === r.key)?.label ?? r.key}${r.who?.trim() ? ` (${r.who.trim()})` : ''}`
  const strict = d.avoid.filter((r) => r.strict).map(item)
  const soft = d.avoid.filter((r) => !r.strict).map(item)
  return [
    strict.length ? `alergie, nu apar deloc: ${strict.join(', ')}` : '',
    soft.length ? `evităm, înlocuiește: ${soft.join(', ')}` : '',
    d.dislikes.trim() ? `nu ne plac: ${d.dislikes.trim()}` : '',
  ].filter(Boolean).join('; ')
}

/** The diet in a short line for the screen ("fără lactoză · fără nuci (alergie, Tibi)"). */
export function dietSummary(d: Diet) {
  return d.avoid.map((r) => {
    const extra = [r.strict ? 'alergie' : '', r.who?.trim() ?? ''].filter(Boolean).join(', ')
    return `fără ${DIET_ITEMS.find((x) => x.key === r.key)?.short ?? r.key}${extra ? ` (${extra})` : ''}`
  }).join(' · ')
}

/** What in a recipe goes against the family's diet, strictest first. */
export function conflicts(allergens: AllergenHit[] | undefined, d: Diet) {
  if (!allergens) return []
  return d.avoid
    .map((r) => {
      // "Carne" (vegetarian) also catches fish, seafood and pork.
      const hits = allergens.filter((a) => a.key === r.key || (r.key === 'carne' && ['peste', 'crustacee', 'moluste', 'porc'].includes(a.key)))
      return hits.length ? { rule: r, from: [...new Set(hits.flatMap((h) => h.from))] } : undefined
    })
    .filter((x): x is { rule: DietRule; from: string[] } => !!x)
    .sort((a, b) => Number(b.rule.strict) - Number(a.rule.strict))
}

const parse = <T>(s: string | null | undefined): T | undefined => { if (!s) return undefined; try { return JSON.parse(s) as T } catch { return undefined } }
export const parseNutrition = (s?: string | null) => { const n = parse<Nutrition>(s); return n && typeof n.kcal === 'number' ? n : undefined }
export const parseAllergens = (s?: string | null) => { const a = parse<AllergenHit[]>(s); return Array.isArray(a) ? a.filter((x) => x?.key) : undefined }
export function parseDiet(s?: string | null): Diet | undefined {
  const d = parse<Partial<Diet>>(s)
  if (!d) return undefined
  return { avoid: (d.avoid ?? []).filter((r) => r?.key).map((r) => ({ key: r.key, strict: !!r.strict, who: r.who || undefined })), dislikes: d.dislikes ?? '' }
}

/** A gram value as people say it: "22 g", "1,8 g". */
export const grams = (n?: number) => (n == null ? '–' : `${n >= 10 ? Math.round(n) : (Math.round(n * 10) / 10).toString().replace('.', ',')} g`)
