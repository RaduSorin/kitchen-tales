// Răgaz's herbarium: a pressed plant for showing up, never for how well it went. No streaks,
// nothing is ever lost, and the feeling scales never count. Plants are worked out on the phone
// from what is already in the vault (notes, months, the bank), counting only what was made after
// the herbarium started. Pure functions only (tested in test/herbarium.test.ts); herbStore.ts
// keeps the book, encrypted in the vault like the rest of Răgaz.
import type { Exercise, MonthPlan, Note } from './model'
import { MONTH_PLANT } from './herbArt'

/** The herbarium's own record (one vault item). */
export type HerbBook = {
  v: 1
  /** When the herbarium started (ms): only what is made from then on counts. */
  since: number
  /** Months and exercises already in the vault at the start (never counted). */
  oldMonths: string[]
  oldExercises: string[]
  /** Plant id → when it was earned (ISO). Month plants are "luna:2026-11". */
  earned: Record<string, string>
  /** Plants already pressed into the herbarium. */
  seen: string[]
  /** The last day Răgaz was opened (YYYY-MM-DD), for "Bine ai revenit". */
  lastVisit?: string
  /** No moment when a plant comes: it waits in the herbarium instead. */
  quiet?: boolean
}

export type HerbGroup = 'Primii pași' | 'Cu timpul' | 'Surprize' | 'Program'
export const HERB_GROUPS: HerbGroup[] = ['Primii pași', 'Cu timpul', 'Surprize', 'Program']

export type Herb = {
  id: string
  group: HerbGroup
  name: string
  /** What brings it, as a fact. */
  how: string
  /** The drawing (herbArt.ts) and the plant's own name, written on the card. */
  art: string
  plant: string
  /** The number written next to the plant, for a series. */
  lvl?: number
  /** Shown as a pencil sketch with "Surpriză" until it comes. */
  secret?: boolean
}

export const HERBS: Herb[] = [
  { id: 'intentie', group: 'Primii pași', art: 'trifoi', plant: 'trifoi', name: 'Prima intenție', how: 'Prima lună planificată, cu intenția ei.' },
  { id: 'vineri', group: 'Primii pași', art: 'lavanda', plant: 'lavandă', name: 'Prima vineri', how: 'Prima notă după un exercițiu de vineri.' },
  { id: 'griji', group: 'Primii pași', art: 'feriga', plant: 'ferigă', name: 'Piatră și plastilină', how: 'Prima listă de griji dusă până la capăt.' },
  { id: 'reflectie', group: 'Primii pași', art: 'ginkgo', plant: 'ginkgo', name: 'Privire înapoi', how: 'Prima reflecție a lunii.' },
  { id: 'randuri', group: 'Primii pași', art: 'numauita', plant: 'nu-mă-uita', name: 'Rândurile mele', how: 'Prima notă liberă în jurnal.' },
  { id: 'exercitiu', group: 'Primii pași', art: 'margareta', plant: 'margaretă', name: 'Exercițiul meu', how: 'Primul exercițiu scris sau schimbat de tine în bancă.' },
  { id: 'seri5', group: 'Cu timpul', art: 'spic', plant: 'spic', lvl: 5, name: '5 seri pentru mine', how: '5 note după exerciții, oricând.' },
  { id: 'seri15', group: 'Cu timpul', art: 'spic', plant: 'spic', lvl: 15, name: '15 seri pentru mine', how: '15 note după exerciții, oricând.' },
  { id: 'seri30', group: 'Cu timpul', art: 'spic', plant: 'spic', lvl: 30, name: '30 de seri pentru mine', how: '30 de note după exerciții, oricând.' },
  { id: 'griji5', group: 'Cu timpul', art: 'coada', plant: 'coada-calului', lvl: 5, name: 'Mai ușor', how: '5 liste de griji, în orice săptămâni.' },
  { id: 'griji12', group: 'Cu timpul', art: 'coada', plant: 'coada-calului', lvl: 12, name: 'Apă limpede', how: '12 liste de griji, în orice săptămâni.' },
  { id: 'luni3', group: 'Cu timpul', art: 'mesteacan', plant: 'mesteacăn', lvl: 3, name: 'Trei anotimpuri', how: '3 luni planificate, oricare.' },
  { id: 'banca5', group: 'Cu timpul', art: 'rozmarin', plant: 'rozmarin', lvl: 5, name: 'Banca mea', how: '5 exerciții ale tale în bancă, scrise sau schimbate.' },
  { id: 'semn', group: 'Cu timpul', art: 'macese', plant: 'măceș', name: 'Semnul lunii', how: 'Ai spus în reflecția lunii că ai văzut semnul pe care ți l-ai ales.' },
  { id: 'libera', group: 'Surprize', art: 'mac', plant: 'mac', secret: true, name: 'Seară liberă', how: 'O vineri lăsată liberă. Și odihna e un exercițiu.' },
  { id: 'pas', group: 'Surprize', art: 'fraga', plant: 'fragă', secret: true, name: 'Pasul mic', how: 'Un pas mic ales în lista de griji.' },
  { id: 'parinte', group: 'Surprize', art: 'musetel', plant: 'mușețel', secret: true, name: 'Părintele bun', how: 'Cele trei întrebări blânde, completate.' },
  { id: 'revenit', group: 'Surprize', art: 'papadie', plant: 'păpădie', secret: true, name: 'Bine ai revenit', how: 'Te-ai întors în Răgaz după o pauză de peste trei săptămâni.' },
  { id: 'claude', group: 'Surprize', art: 'clopotel', plant: 'clopoțel', secret: true, name: 'Am întrebat', how: 'Prima discuție cu Claude.' },
  { id: 'program', group: 'Program', art: 'cununa', plant: 'cunună', name: 'Cele 28 de zile', how: 'Câte o notă la fiecare exercițiu din programul de 28 de zile, în ce ordine și în cât timp vrei.' },
]
export const HERB = new Map(HERBS.map((h) => [h.id, h]))

/** The 28-day program: a pack in the bank with "28" in its name (only on the accounts that have it). */
export const isProgramPack = (title?: string) => !!title && /\b28\b/.test(title)

/** A month's plant ("luna:2026-11"), or a plant from the catalogue. */
export function herbOf(id: string): Herb | undefined {
  const m = /^luna:(\d{4})-(\d{2})$/.exec(id)
  if (!m) return HERB.get(id)
  const p = MONTH_PLANT[m[2]]
  if (!p) return undefined
  const name = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('ro-RO', { month: 'long' })
  return { id, group: 'Primii pași', art: p.art, plant: p.name, name: name[0].toUpperCase() + name.slice(1), how: `${name[0].toUpperCase() + name.slice(1)} ${m[1]}, încheiat cu reflecția lunii.` }
}

/** What the rules look at: everything in the vault, plus two facts herbStore.ts works out. */
export type HerbData = {
  notes: Note[]
  months: MonthPlan[]
  exercises: Exercise[]
  /** A message to Claude written after the start. */
  asked: boolean
  /** Răgaz opened today after more than three weeks away. */
  returned: boolean
  /** Today, YYYY-MM-DD. */
  today: string
}

/** A note written after an exercise (a Friday note). */
export const afterExercise = (n: Note) => n.kind === 'friday' || (!n.kind && (!!n.exerciseId || n.id.startsWith('fri-')))

/** The counts the rules need, from what was made after the start only. */
export function tally(book: HerbBook, d: HerbData) {
  const notes = d.notes.filter((n) => n.createdAt >= book.since)
  const months = d.months.filter((m) => !book.oldMonths.includes(m.id) && m.savedAt >= book.since)
  const own = d.exercises.filter((e) => !book.oldExercises.includes(e.id) && (!e.packId || e.edited))
  const worries = notes.filter((n) => n.kind === 'worry')
  const reflections = notes.filter((n) => n.kind === 'reflection')
  const evenings = notes.filter(afterExercise)
  const program = d.exercises.filter((e) => isProgramPack(e.packTitle))
  const doneIds = new Set(notes.map((n) => n.exerciseId).filter(Boolean))
  return {
    intention: months.filter((m) => m.intention.trim()).length,
    evenings: evenings.length,
    worries: worries.length,
    reflections,
    free: notes.filter((n) => n.kind === 'free').length,
    own: own.length,
    months: months.length,
    sign: reflections.some((n) => n.answers?.sign === 'da'),
    rest: months.some((m) => m.fridays.some((f) => !f.exerciseId && !f.title.trim() && f.date <= d.today)),
    step: worries.some((n) => !!n.worry?.step?.trim()),
    parent: worries.some((n) => !!(n.worry?.parent?.what?.trim() && n.worry.parent.hardest?.trim() && n.worry.parent.need?.trim())),
    program: program.length ? [program.filter((e) => doneIds.has(e.id)).length, program.length] as const : undefined,
  }
}
export type Tally = ReturnType<typeof tally>

/** [done so far, needed] for a plant of the catalogue. */
export function progress(id: string, t: Tally, d: Pick<HerbData, 'asked' | 'returned'>): [number, number] {
  switch (id) {
    case 'intentie': return [t.intention, 1]
    case 'vineri': return [t.evenings, 1]
    case 'griji': return [t.worries, 1]
    case 'reflectie': return [t.reflections.length, 1]
    case 'randuri': return [t.free, 1]
    case 'exercitiu': return [t.own, 1]
    case 'seri5': return [t.evenings, 5]
    case 'seri15': return [t.evenings, 15]
    case 'seri30': return [t.evenings, 30]
    case 'griji5': return [t.worries, 5]
    case 'griji12': return [t.worries, 12]
    case 'luni3': return [t.months, 3]
    case 'banca5': return [t.own, 5]
    case 'semn': return [t.sign ? 1 : 0, 1]
    case 'libera': return [t.rest ? 1 : 0, 1]
    case 'pas': return [t.step ? 1 : 0, 1]
    case 'parinte': return [t.parent ? 1 : 0, 1]
    case 'revenit': return [d.returned ? 1 : 0, 1]
    case 'claude': return [d.asked ? 1 : 0, 1]
    case 'program': return t.program ? [t.program[0], t.program[1]] : [0, 1]
    default: return [0, 1]
  }
}

/** Gives every plant now due. Returns the new book and the plants just earned. */
export function earn(book: HerbBook, d: HerbData, now: Date): { book: HerbBook; fresh: string[] } {
  const t = tally(book, d)
  const fresh: string[] = []
  for (const h of HERBS) {
    if (book.earned[h.id]) continue
    const [have, need] = progress(h.id, t, d)
    if (have >= need && need > 0 && (h.id !== 'program' || t.program)) fresh.push(h.id)
  }
  for (const r of t.reflections) {
    const id = `luna:${r.month}`
    if (!book.earned[id] && !fresh.includes(id) && herbOf(id)) fresh.push(id)
  }
  if (!fresh.length) return { book, fresh }
  const iso = now.toISOString()
  return { book: { ...book, earned: { ...book.earned, ...Object.fromEntries(fresh.map((id) => [id, iso])) } }, fresh }
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** A pause long enough for "Bine ai revenit". */
export const AWAY_DAYS = 21

/** The catalogue plants a person can see: the program only when its pack is in the bank. */
export const visibleHerbs = (hasProgram: boolean) => HERBS.filter((h) => h.id !== 'program' || hasProgram)
