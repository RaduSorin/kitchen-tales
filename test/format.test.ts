import { describe, expect, it } from 'vitest'
import { formatMinutes, matchesQuery, stem } from '../src/lib/format'

describe('matchesQuery (Romanian search)', () => {
  it('ignores diacritics and case', () => {
    expect(matchesQuery('Ciorbă de perișoare', 'ciorba')).toBe(true)
  })

  // QA 4 Nov, M6: search did not match plurals.
  it('matches singular and plural forms', () => {
    expect(matchesQuery('2 cepe roșii', 'ceapa')).toBe(true)
    expect(matchesQuery('Cartofi țărănești', 'cartof')).toBe(true)
    expect(matchesQuery('ouă fierte', 'ou')).toBe(true)
  })

  it('needs every word, and matches everything for an empty query', () => {
    expect(matchesQuery('Supă de pui', 'peste')).toBe(false)
    expect(matchesQuery('Supă de pui', 'supa peste')).toBe(false)
    expect(matchesQuery('Supă de pui', '')).toBe(true)
  })

  it('folds the plural vowel changes together', () => {
    expect(stem('ceapă')).toBe(stem('cepe'))
    expect(stem('varză')).toBe(stem('verze'))
  })
})

describe('formatMinutes', () => {
  it('writes hours and minutes', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(95)).toBe('1 h 35')
  })
})
