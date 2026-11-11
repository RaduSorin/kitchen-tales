import { describe, expect, it } from 'vitest'
import { daysBetween, earn, herbOf, HERBS, isProgramPack, progress, tally, visibleHerbs, type HerbBook, type HerbData } from '../src/lib/mind/herbarium'
import { MONTH_PLANT, PLANT_NAMES, plantSvg } from '../src/lib/mind/herbArt'
import type { Exercise, MonthPlan, Note } from '../src/lib/mind/model'

const SINCE = Date.parse('2026-11-11T10:00:00')
const now = new Date('2026-11-20T20:00:00')
const book = (patch: Partial<HerbBook> = {}): HerbBook => ({ v: 1, since: SINCE, oldMonths: [], oldExercises: [], earned: {}, seen: [], ...patch })
const data = (patch: Partial<HerbData> = {}): HerbData => ({ notes: [], months: [], exercises: [], asked: false, returned: false, today: '2026-11-20', ...patch })
let n = 0
const note = (patch: Partial<Note>): Note => ({ id: `n${n++}`, date: '2026-11-14', month: '2026-11', text: '', createdAt: SINCE + 1000, ...patch })
const friday = (exerciseId = 'e1') => note({ id: `fri-${n++}`, exerciseId, kind: 'friday' })
const month = (patch: Partial<MonthPlan> = {}): MonthPlan => ({ id: '2026-12', intention: 'Seri doar pentru mine', fridays: [], savedAt: SINCE + 1000, ...patch })

describe('catalogue', () => {
  it('has unique ids and a drawing for every plant and month', () => {
    expect(new Set(HERBS.map((h) => h.id)).size).toBe(HERBS.length)
    for (const h of HERBS) expect(PLANT_NAMES).toContain(h.art)
    for (const m of Object.values(MONTH_PLANT)) expect(PLANT_NAMES).toContain(m.art)
    expect(Object.keys(MONTH_PLANT)).toHaveLength(12)
    for (const a of PLANT_NAMES) expect(plantSvg(a)).toContain('<svg')
  })

  it('names the month plants', () => {
    expect(herbOf('luna:2026-11')).toMatchObject({ art: 'stejar', name: 'Noiembrie' })
    expect(herbOf('luna:2026-13')).toBeUndefined()
  })

  it('shows the 28-day program only with its pack', () => {
    expect(visibleHerbs(false).some((h) => h.id === 'program')).toBe(false)
    expect(visibleHerbs(true).some((h) => h.id === 'program')).toBe(true)
    expect(isProgramPack('Programul de 28 de zile')).toBe(true)
    expect(isProgramPack('Respirații')).toBe(false)
  })
})

describe('first steps', () => {
  it('gives a plant for each first thing done', () => {
    const { fresh } = earn(book(), data({
      notes: [friday(), note({ kind: 'worry', worry: { stone: ['a'], clay: ['b'] } }), note({ kind: 'free' }), note({ kind: 'reflection', answers: {} })],
      months: [month()],
      exercises: [{ id: 'x', title: 'Plimbare', steps: '' }],
    }), now)
    expect(fresh).toEqual(expect.arrayContaining(['intentie', 'vineri', 'griji', 'randuri', 'reflectie', 'exercitiu', 'luna:2026-11']))
  })

  it('counts nothing from before the herbarium started', () => {
    const old = SINCE - 1000
    const { fresh } = earn(book({ oldMonths: ['2026-12'], oldExercises: ['x'] }), data({
      notes: [note({ kind: 'friday', exerciseId: 'e', createdAt: old }), note({ kind: 'reflection', createdAt: old })],
      months: [month({ savedAt: SINCE + 5000 })],
      exercises: [{ id: 'x', title: 'Plimbare', steps: '', edited: true }],
    }), now)
    expect(fresh).toEqual([])
  })

  it('does not count an exercise imported from a pack unless it was changed', () => {
    const pack: Exercise = { id: 'p', title: 'Din pachet', steps: '', packId: 'k', packTitle: 'Pachet' }
    expect(earn(book(), data({ exercises: [pack] }), now).fresh).not.toContain('exercitiu')
    expect(earn(book(), data({ exercises: [{ ...pack, edited: true }] }), now).fresh).toContain('exercitiu')
  })

  it('does not give the same plant twice', () => {
    const first = earn(book(), data({ notes: [friday()] }), now)
    expect(first.fresh).toContain('vineri')
    expect(earn(first.book, data({ notes: [friday(), friday()] }), now).fresh).not.toContain('vineri')
  })
})

describe('with time, never in a row', () => {
  it('counts evenings on any days', () => {
    const notes = Array.from({ length: 15 }, () => friday())
    const { fresh } = earn(book(), data({ notes }), now)
    expect(fresh).toEqual(expect.arrayContaining(['seri5', 'seri15']))
    expect(fresh).not.toContain('seri30')
    expect(progress('seri30', tally(book(), data({ notes })), data())).toEqual([15, 30])
  })

  it('never counts the feeling scales', () => {
    const t = tally(book(), data({ notes: [note({ kind: 'friday', exerciseId: 'e', before: 8, after: 2 })] }))
    expect(Object.keys(t)).not.toContain('drop')
  })
})

describe('the sign of the month', () => {
  it('comes only when the person says they saw it', () => {
    expect(earn(book(), data({ notes: [note({ kind: 'reflection', answers: { sign: 'nu' } })] }), now).fresh).not.toContain('semn')
    expect(earn(book(), data({ notes: [note({ kind: 'reflection', answers: { sign: 'da' } })] }), now).fresh).toContain('semn')
  })
})

describe('surprises', () => {
  it('a free Friday counts once its day has come', () => {
    const m = month({ id: '2026-11', fridays: [{ date: '2026-11-20', title: '' }, { date: '2026-11-27', title: 'Respirație', exerciseId: 'e' }] })
    expect(earn(book(), data({ months: [m] }), now).fresh).toContain('libera')
    expect(earn(book(), data({ months: [m], today: '2026-11-19' }), now).fresh).not.toContain('libera')
  })

  it('the small step and the three gentle questions', () => {
    const w = note({ kind: 'worry', worry: { stone: [], clay: ['x'], step: 'Sun mâine', parent: { what: 'a', hardest: 'b', need: 'c' } } })
    expect(earn(book(), data({ notes: [w] }), now).fresh).toEqual(expect.arrayContaining(['pas', 'parinte']))
    const half = note({ kind: 'worry', worry: { stone: [], clay: [], parent: { what: 'a' } } })
    expect(earn(book(), data({ notes: [half] }), now).fresh).not.toContain('parinte')
  })

  it('coming back and asking Claude', () => {
    expect(earn(book(), data({ returned: true, asked: true }), now).fresh).toEqual(expect.arrayContaining(['revenit', 'claude']))
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31)
  })
})

describe('the 28-day program', () => {
  const pack = (i: number): Exercise => ({ id: `p${i}`, title: `Ziua ${i}`, steps: '', packId: 'k', packTitle: 'Programul de 28 de zile' })
  it('comes with a note for every exercise of the pack, in any order', () => {
    const exercises = Array.from({ length: 3 }, (_, i) => pack(i))
    expect(earn(book(), data({ exercises, notes: [friday('p0'), friday('p2')] }), now).fresh).not.toContain('program')
    expect(earn(book(), data({ exercises, notes: [friday('p2'), friday('p0'), friday('p1')] }), now).fresh).toContain('program')
  })
  it('never comes without the pack', () => {
    expect(earn(book(), data({ notes: [friday()] }), now).fresh).not.toContain('program')
  })
})
