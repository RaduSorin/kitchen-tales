import { describe, expect, it } from 'vitest'
import { mergeShopping } from '../src/lib/merge'

const item = (id: string, text: string, recipeTitle?: string) => ({ id, text, checked: false, recipeTitle })

describe('mergeShopping', () => {
  it('adds up the same thing from two recipes, singular and plural', () => {
    const rows = mergeShopping([item('1', '2 cepe mari', 'Ciorbă'), item('2', '1 ceapă', 'Tocană')])
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('3 cepe mari')
    expect(rows[0].sources).toEqual(['Ciorbă', 'Tocană'])
    expect(rows[0].items.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('converts units before adding (g + kg)', () => {
    expect(mergeShopping([item('1', '500 g făină'), item('2', '1 kg făină')]).map((r) => r.text)).toEqual(['1 ½ kg făină'])
  })

  it('keeps a range on its own line', () => {
    expect(mergeShopping([item('1', '2-3 căței usturoi'), item('2', '2 căței usturoi')])).toHaveLength(2)
  })

  it('shows lines without amounts once', () => {
    expect(mergeShopping([item('1', 'sare', 'A'), item('2', 'sare', 'B')]).map((r) => r.text)).toEqual(['sare'])
  })
})
