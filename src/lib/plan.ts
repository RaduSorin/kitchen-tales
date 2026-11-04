// The week plan and the shopping list, shared by the whole family.
import { newId, planApi, shoppingApi } from './db'
import { scaleIngredient } from './scale'
import { createSyncedList } from './synced'
import type { PlanEntry, Recipe, ShoppingItem } from './types'

export const planStore = createSyncedList<PlanEntry>('plan', planApi)
export const shoppingStore = createSyncedList<ShoppingItem>('shopping', shoppingApi)

// ---- dates (local time, weeks start on Monday) ----

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
export const weekDays = (monday: Date) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

export const dayName = (d: Date) => { const s = d.toLocaleDateString('ro-RO', { weekday: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1) }
export const shortDate = (d: Date) => d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }).replace('.', '')

export function weekLabel(monday: Date) {
  const sunday = addDays(monday, 6)
  const thisWeek = dayKey(mondayOf(today()))
  const k = dayKey(monday)
  if (k === thisWeek) return 'Săptămâna asta'
  if (k === dayKey(addDays(fromKey(thisWeek), 7))) return 'Săptămâna viitoare'
  if (k === dayKey(addDays(fromKey(thisWeek), -7))) return 'Săptămâna trecută'
  return `${shortDate(monday)} – ${shortDate(sunday)}`
}

// ---- plan ----

export function planRecipe(recipe: Recipe, day: string, servings?: number) {
  planStore.create({ id: newId(), day, recipeId: recipe.id, servings: servings && servings !== recipe.servings ? servings : undefined })
}

// ---- shopping ----

/** Lines that are headings ("Pentru sos:") rather than things to buy. */
const isHeading = (line: string) => /:\s*$/.test(line.trim())

/** Puts a recipe's ingredients on the list (scaled to the servings); skips lines already there and not yet bought. Returns how many were added. */
export function addToShopping(recipe: Recipe, servings?: number, only?: string[]) {
  const factor = recipe.servings && servings ? servings / recipe.servings : 1
  const lines = (only ?? recipe.ingredients).filter((l) => l.trim() && !isHeading(l)).map((l) => scaleIngredient(l.trim(), factor))
  const open = new Set(shoppingStore.get().filter((s) => !s.checked && s.recipeId === recipe.id).map((s) => s.text))
  let added = 0
  for (const text of lines) {
    if (open.has(text)) continue
    open.add(text)
    shoppingStore.create({ id: newId(), text, checked: false, recipeId: recipe.id, recipeTitle: recipe.title, createdAt: new Date().toISOString() })
    added++
  }
  return added
}

/**
 * The week's ingredients on the list: each planned cooking counts (a dish planned twice needs
 * twice the amounts), scaled to its servings. A recipe's lines not yet bought are replaced by
 * the new totals, so pressing again never adds them twice. Returns how many lines were added.
 */
export function addPlanToShopping(entries: { recipe: Recipe; servings?: number }[]) {
  const byRecipe = new Map<string, { recipe: Recipe; factor: number }>()
  for (const { recipe, servings } of entries) {
    const one = recipe.servings && servings ? servings / recipe.servings : 1
    const cur = byRecipe.get(recipe.id)
    byRecipe.set(recipe.id, { recipe, factor: (cur?.factor ?? 0) + one })
  }
  let added = 0
  for (const { recipe, factor } of byRecipe.values()) {
    const want = [...new Set(recipe.ingredients.filter((l) => l.trim() && !isHeading(l)).map((l) => scaleIngredient(l.trim(), factor)))]
    const open = shoppingStore.get().filter((s) => !s.checked && s.recipeId === recipe.id)
    const have = new Set(open.map((s) => s.text))
    // Old amounts for this recipe (e.g. one cooking's worth) make way for the totals.
    for (const s of open) if (!want.includes(s.text)) shoppingStore.remove(s.id)
    for (const text of want) {
      if (have.has(text)) continue
      shoppingStore.create({ id: newId(), text, checked: false, recipeId: recipe.id, recipeTitle: recipe.title, createdAt: new Date().toISOString() })
      added++
    }
  }
  return added
}

export function addShoppingText(text: string) {
  const t = text.trim()
  if (t) shoppingStore.create({ id: newId(), text: t, checked: false, createdAt: new Date().toISOString() })
}
