import { describe, expect, it } from 'vitest'
import { sinceText, todayIdeas } from '../src/lib/todayIdeas'
import type { Recipe, RecipeLog } from '../src/lib/types'

const r = (id: string, extra: Partial<Recipe> = {}): Recipe => ({ id, title: id, category: '', ingredients: [], steps: [], ...extra })
const log = (recipeId: string, cooked: string[], favorite = false): RecipeLog => ({ id: recipeId, recipeId, favorite, cooked, notes: [] })
const logs = (...l: RecipeLog[]) => new Map(l.map((x) => [x.recipeId, x]))
const morning = new Date(2026, 10, 11, 10)
const evening = new Date(2026, 10, 11, 19)

describe('todayIdeas (Acasă › Azi with nothing planned)', () => {
  const recipes = [
    r('ciorba', { minutes: 50 }),
    r('paste', { minutes: 20 }),
    r('tarta', { createdAt: '2026-11-02T10:00:00Z' }),
    r('pui'),
  ]
  const l = logs(log('ciorba', ['2026-09-18']), log('paste', ['2026-10-01', '2026-10-20'], true), log('pui', ['2026-11-08']))

  it('gives three dishes, each for a different reason, with the reason written out', () => {
    const ideas = todayIdeas(recipes, l, new Set(), morning)
    expect(ideas.map((i) => [i.r.id, i.kind])).toEqual([['ciorba', 'demult'], ['paste', 'favorita'], ['tarta', 'noua']])
    expect(ideas[0].why).toBe('N-ai mai gătit-o de 7 săptămâni')
    expect(ideas[1].why).toBe('Favorită · gata în 20 min')
    expect(ideas[1].meta).toBe('gătită de 2 ori')
    expect(ideas[2].why).toBe('Încă negătită')
  })

  it('leaves out what is planned this week and what was cooked in the last 7 days', () => {
    const ids = todayIdeas(recipes, l, new Set(['ciorba']), morning).map((i) => i.r.id)
    expect(ids).not.toContain('ciorba')
    expect(ids).not.toContain('pui')
  })

  it('puts the quick dish first in the evening', () => {
    expect(todayIdeas(recipes, l, new Set(), evening)[0]).toMatchObject({ r: { id: 'paste' }, kind: 'rapida' })
  })

  it('moves on to other dishes with "Alte idei"', () => {
    const many = [...recipes, r('tocanita'), r('pastrav')]
    const ml = logs(...l.values(), log('tocanita', ['2026-09-25']), log('pastrav', ['2026-10-02']))
    const first = todayIdeas(many, ml, new Set(), morning)
    const next = todayIdeas(many, ml, new Set(), morning, 1)
    expect(next[0].r.id).not.toBe(first[0].r.id)
  })

  it('skips recipes shared by another space', () => {
    expect(todayIdeas([r('x', { mine: false })], logs(), new Set(), morning)).toEqual([])
  })
})

describe('sinceText', () => {
  it('speaks in weeks, then months, then years', () => {
    expect(sinceText(8)).toBe('de o săptămână')
    expect(sinceText(49)).toBe('de 7 săptămâni')
    expect(sinceText(70)).toBe('de 2 luni')
    expect(sinceText(400)).toBe('de un an')
  })
})
