import { describe, expect, it } from 'vitest'
import { formatQuantity, parseQuantity, scaleIngredient } from '../src/lib/scale'

describe('scaleIngredient', () => {
  it.each([
    ['500 g carne', 1.5, '750 g carne'],
    ['1,5 kg cartofi', 0.5, '¾ kg cartofi'],
    ['1 1/2 cană lapte', 2, '3 căni lapte'],
    ['½ linguriță sare', 2, '1 linguriță sare'],
    ['1 ou', 3, '3 ouă'],
    ['2 ouă', 0.5, '1 ou'],
  ])('%s × %s → %s', (line, factor, expected) => {
    expect(scaleIngredient(line, factor)).toBe(expected)
  })

  // QA 4 Nov, H2: "2-3" × 2 used to become "4 -3".
  it('scales both ends of a range', () => {
    expect(scaleIngredient('2-3 căței usturoi', 2)).toBe('4-6 căței usturoi')
  })

  it('leaves lines without an amount, or with a backwards range, as they are', () => {
    expect(scaleIngredient('sare după gust', 2)).toBe('sare după gust')
    expect(scaleIngredient('3-2 cod', 2)).toBe('3-2 cod')
  })
})

describe('parseQuantity', () => {
  it('reads ranges and fractions', () => {
    expect(parseQuantity('2-3 căței')).toMatchObject({ value: 2, max: 3 })
    expect(parseQuantity('1½ cană')).toMatchObject({ value: 1.5 })
    expect(parseQuantity('sare')).toBeUndefined()
  })
})

describe('formatQuantity', () => {
  it('uses kitchen fractions', () => {
    expect(formatQuantity(1 / 3)).toBe('⅓')
    expect(formatQuantity(1.5)).toBe('1 ½')
    expect(formatQuantity(2.25)).toBe('2 ¼')
    expect(formatQuantity(1250)).toBe('1250')
  })
})
