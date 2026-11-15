import { describe, expect, it } from 'vitest'
import { minutesOf, parseRecipeText, servingsOf } from '../src/lib/parseRecipe'
import { aisleOf } from '../src/lib/aisles'

describe('parseRecipeText', () => {
  it('splits a pasted recipe into title, ingredients and steps', () => {
    const text = 'Clătite\n\nIngrediente:\n2 ouă\n500 ml lapte\n\nMod de preparare:\n1. Amestecă.\n2. Coace.'
    expect(parseRecipeText(text)).toEqual({ title: 'Clătite', ingredients: ['2 ouă', '500 ml lapte'], steps: ['Amestecă.', 'Coace.'] })
  })
})

describe('servings and time in pasted text', () => {
  it('fills servings and time instead of adding them as steps', () => {
    const text = 'Tocăniță\nPorții: 4\nTimp: 30 min\nIngrediente:\n2 cepe\nMod de preparare:\nCălește ceapa.'
    expect(parseRecipeText(text)).toEqual({ title: 'Tocăniță', ingredients: ['2 cepe'], steps: ['Călește ceapa.'], servings: 4, minutes: 30 })
  })

  it('reads the usual ways of writing them', () => {
    expect(servingsOf('Pentru 6 persoane')).toBe(6)
    expect(servingsOf('Porţii 2')).toBe(2)
    expect(servingsOf('Porții de legume')).toBeUndefined()
    expect(minutesOf('Timp total: 1 h 30 min')).toBe(90)
    expect(minutesOf('Timp de preparare: 1 oră')).toBe(60)
    expect(minutesOf('Total time: 45 minutes')).toBe(45)
    expect(minutesOf('Timpul e scurt')).toBeUndefined()
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
