import { describe, expect, it } from 'vitest'
import { parseRecipeText } from '../src/lib/parseRecipe'
import { aisleOf } from '../src/lib/aisles'

describe('parseRecipeText', () => {
  it('splits a pasted recipe into title, ingredients and steps', () => {
    const text = 'Clătite\n\nIngrediente:\n2 ouă\n500 ml lapte\n\nMod de preparare:\n1. Amestecă.\n2. Coace.'
    expect(parseRecipeText(text)).toEqual({ title: 'Clătite', ingredients: ['2 ouă', '500 ml lapte'], steps: ['Amestecă.', 'Coace.'] })
  })
})

describe('aisleOf', () => {
  it('puts common ingredients in their shop aisle', () => {
    expect(aisleOf('2 cepe')).toBe('produce')
    expect(aisleOf('500 g piept de pui')).toBe('meat')
    expect(aisleOf('1 l lapte')).toBe('dairy')
    expect(aisleOf('ceva ciudat')).toBe('other')
  })
})
