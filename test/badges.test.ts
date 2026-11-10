import { describe, expect, it } from 'vitest'
import { BADGE, BADGES, STAMPS, STICKERS } from '../src/lib/badges/catalog'
import { applyEvent, emptyState, evaluate, historyState, mergeStates, progressOf, type BadgeEvent, type BadgeState, type History } from '../src/lib/badges/engine'
import { videoSite } from '../src/lib/videoSite'

const at = (iso: string) => new Date(iso)
const run = (events: BadgeEvent[], now = at('2026-11-10T18:00:00')) => events.reduce((s, e) => applyEvent(s, e, now), emptyState())
const finished = (storyId: string, folder = 'Basme', folders = ['Basme']): BadgeEvent => ({ t: 'story-finished', storyId, folder, folders })

describe('catalogue', () => {
  it('has unique ids, and stamps and stickers', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length)
    expect(STAMPS.length).toBe(33)
    expect(STICKERS.length).toBe(20)
    expect(STAMPS.every((b) => b.cap && b.ink)).toBe(true)
  })
})

describe('recipes', () => {
  it('gives the stamp for each way a recipe came in', () => {
    const s = run([{ t: 'recipe-added', way: 'photo', photo: true }, { t: 'recipe-added', way: 'video', photo: false }])
    const { fresh } = evaluate(s, at('2026-11-10T18:00:00'))
    expect(fresh).toEqual(expect.arrayContaining(['poza', 'video']))
    expect(fresh).not.toContain('link')
  })

  it('counts the collection series and shows progress towards the next', () => {
    const s = run(Array.from({ length: 12 }, () => ({ t: 'recipe-added', way: 'written', photo: false }) as BadgeEvent))
    const { fresh, state } = evaluate(s, at('2026-11-10T18:00:00'))
    expect(fresh).toEqual(expect.arrayContaining(['c5', 'c10']))
    expect(fresh).not.toContain('c25')
    expect(progressOf(BADGE.get('c25')!, state, new Date())).toEqual({ have: 12, need: 25, done: false })
  })

  it('counts different categories once each, whatever the case', () => {
    const cats = ['Ciorbe', 'ciorbe', 'Desert', 'Paste', 'Salate', 'Fel principal']
    const s = run(cats.map((category) => ({ t: 'recipe-added', way: 'link', category, photo: false }) as BadgeEvent))
    expect(s.sets.categories).toHaveLength(5)
    expect(evaluate(s, new Date()).fresh).toContain('categorii')
  })

  it('knows the same recipe cooked five times', () => {
    const s = run([...Array.from({ length: 4 }, () => ({ t: 'cooked', recipeId: 'a' }) as BadgeEvent), { t: 'cooked', recipeId: 'b' }])
    expect(evaluate(s, new Date()).fresh).not.toContain('casei')
    expect(evaluate(applyEvent(s, { t: 'cooked', recipeId: 'a' }, new Date()), new Date()).fresh).toContain('casei')
  })

  it('gives the night and Sunday surprises only at those times', () => {
    expect(evaluate(run([{ t: 'cook-opened' }], at('2026-11-10T23:30:00')), new Date()).fresh).toContain('noapte')
    expect(evaluate(run([{ t: 'cook-opened' }], at('2026-11-10T20:00:00')), new Date()).fresh).not.toContain('noapte')
    // 8 Nov 2026 is a Sunday.
    expect(evaluate(run([{ t: 'cooked', recipeId: 'a' }], at('2026-11-08T10:00:00')), new Date()).fresh).toContain('brunch')
    expect(evaluate(run([{ t: 'cooked', recipeId: 'a' }], at('2026-11-08T12:00:00')), new Date()).fresh).not.toContain('brunch')
  })

  it('needs an A4 book of at least 20 recipes for the print stamp', () => {
    expect(evaluate(run([{ t: 'cookbook', size: 'a4', recipes: 12 }]), new Date()).fresh).toEqual(['pdf'])
    expect(evaluate(run([{ t: 'cookbook', size: 'a4', recipes: 20 }]), new Date()).fresh).toEqual(['pdf', 'tipar'])
  })

  it('keeps the highest number of timers running at once', () => {
    const s = run([{ t: 'timers', running: 2 }, { t: 'timers', running: 3 }, { t: 'timers', running: 1 }])
    expect(s.counts.timers).toBe(3)
  })
})

describe('stories', () => {
  it('gives at most one listening sticker an evening', () => {
    const s = run(Array.from({ length: 5 }, (_, i) => finished(`s${i}`)))
    const first = evaluate(s, at('2026-11-10T20:00:00'))
    expect(first.fresh).toEqual(['k-star'])
    // Same evening: Luna (5 stories) waits.
    expect(evaluate(first.state, at('2026-11-10T21:00:00')).fresh).toEqual([])
    // The next day it comes.
    expect(evaluate(first.state, at('2026-11-11T19:00:00')).fresh).toEqual(['k-moon'])
  })

  it('does not hold back stickers for making stories', () => {
    const s = run([finished('a'), { t: 'story-added', source: 'recording' }, { t: 'folder-made' }])
    expect(evaluate(s, new Date()).fresh).toEqual(['k-star', 'k-heart', 'k-house'])
  })

  it('counts a story heard three times for the rainbow', () => {
    const s = run([finished('a'), finished('a'), finished('a')])
    const { state } = evaluate(s, at('2026-11-01T19:00:00'))
    expect(evaluate(state, at('2026-11-02T19:00:00')).fresh).toContain('k-rainbow')
  })

  it('needs a story from every folder for the rocket', () => {
    const all = ['Basme', 'Cântece', 'Animale']
    const two = run([finished('a', 'Basme', all), finished('b', 'Cântece', all)])
    expect(progressOf(BADGE.get('k-rocket')!, two, new Date())).toEqual({ have: 2, need: 3, done: false })
    const three = applyEvent(two, finished('c', 'Animale', all), new Date())
    expect(progressOf(BADGE.get('k-rocket')!, three, new Date()).done).toBe(true)
  })

  it('counts late evenings by day, past midnight as the evening before', () => {
    let s = emptyState()
    s = applyEvent(s, finished('a'), at('2026-11-10T21:30:00'))
    s = applyEvent(s, finished('b'), at('2026-11-11T00:30:00'))
    s = applyEvent(s, finished('c'), at('2026-11-11T19:00:00'))
    expect(s.sets.evenings).toEqual(['2026-11-10'])
  })
})

describe('merge', () => {
  it('keeps the larger counters, every set item, the earliest date and every seen badge', () => {
    const a: BadgeState = { counts: { recipes: 3, cooked: 9 }, sets: { categories: ['ciorbe'] }, earned: { link: '2026-11-02T10:00:00.000Z' }, seen: ['link'], listenDay: '2026-11-01' }
    const b: BadgeState = { counts: { recipes: 5 }, sets: { categories: ['paste'] }, earned: { link: '2026-11-01T10:00:00.000Z', c5: '2026-11-03T10:00:00.000Z' }, seen: ['c5'], listenDay: '2026-11-04' }
    const m = mergeStates(a, b)
    expect(m.counts).toEqual({ recipes: 5, cooked: 9 })
    expect(m.sets.categories.sort()).toEqual(['ciorbe', 'paste'])
    expect(m.earned).toEqual({ link: '2026-11-01T10:00:00.000Z', c5: '2026-11-03T10:00:00.000Z' })
    expect(m.seen.sort()).toEqual(['c5', 'link'])
    expect(m.listenDay).toBe('2026-11-04')
    expect(mergeStates(m, m)).toEqual(m)
  })
})

describe('history', () => {
  const h: History = {
    recipes: [
      { category: 'Desert', sourceUrl: 'https://www.youtube.com/watch?v=1', photoKey: 'p1', createdAt: '2025-10-01T10:00:00Z' },
      { category: 'Ciorbe', sourceUrl: 'https://jamilacuisine.ro/x', shared: true },
      { category: 'Paste' },
      { category: 'Străină', mine: false },
    ],
    logs: [{ recipeId: 'a', cooked: ['2026-01-01', '2026-01-08'], notes: [{}] }],
    planDays: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
    stories: [{ source: 'recording', coverKey: 'c' }, { source: 'generated' }],
    folders: 1, kidMode: true, offline: 0, played: 4,
    isVideo: (u) => !!videoSite(u),
  }
  it('counts only our own things and finds a full week', () => {
    const s = historyState(h, at('2026-11-10T12:00:00'))
    expect(s.counts.recipes).toBe(3)
    expect(s.counts['way:video']).toBe(1)
    expect(s.counts['way:link']).toBe(1)
    expect(s.counts.cooked).toBe(2)
    expect(s.counts.week).toBe(1)
    expect(s.since).toBe('2025-10-01T10:00:00Z')
    const { fresh } = evaluate(s, at('2026-11-10T12:00:00'), { history: true })
    expect(fresh).toEqual(expect.arrayContaining(['link', 'video', 'prima', 'nota', 'saptamana', 'impartim', 'an', 'k-star', 'k-heart', 'k-wand', 'k-crayon', 'k-house', 'k-teddy']))
    // History is not held to one listening sticker an evening.
    expect(fresh).toContain('k-star')
    expect(fresh).not.toContain('k-moon')
  })
})

describe('drawings', async () => {
  const { hasArt } = await import('../src/lib/badges/art')
  it('has a drawing for every badge', () => {
    expect(BADGES.filter((b) => !hasArt(b)).map((b) => b.id)).toEqual([])
  })
})
