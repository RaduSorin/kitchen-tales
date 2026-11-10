import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib'
import { buildCookbook, byCategory, count, type CookbookRecipe } from '../src/lib/cookbook/pdf'
import type { Recipe } from '../src/lib/types'

const font = (n: string) => new Uint8Array(readFileSync(`public/fonts/pdf/${n}.ttf`))
const fonts = { serif: font('fraunces-600'), serifItalic: font('fraunces-600-italic'), sans: font('figtree-400'), sansBold: font('figtree-700'), sansBlack: font('figtree-800') }

const recipe = (id: string, title: string, category: string, extra: Partial<Recipe> = {}): CookbookRecipe => ({
  recipe: { id, title, category, ingredients: ['500 g făină', 'Pentru glazură:', 'zahăr'], steps: ['Amestecă.', 'Coace 30 de minute.'], ...extra },
  favorite: false, cooked: 0, notes: [],
})

describe('cookbook', () => {
  it('orders categories like the editor, then the rest, "Altele" last', () => {
    const g = byCategory([recipe('1', 'B', 'Deserturi'), recipe('2', 'A', ''), recipe('3', 'Ș', 'Aperitive'), recipe('4', 'C', 'Ciorbe și supe'), recipe('5', 'A', 'Deserturi')])
    expect(g.map((x) => x.category)).toEqual(['Ciorbe și supe', 'Deserturi', 'Aperitive', 'Altele'])
    expect(g[1].items.map((r) => r.recipe.title)).toEqual(['A', 'B'])
  })

  it('says counts the Romanian way', () => {
    expect([1, 5, 19, 20, 24, 101, 120].map((n) => count(n, 'rețetă', 'rețete'))).toEqual(['1 rețetă', '5 rețete', '19 rețete', '20 de rețete', '24 de rețete', '101 rețete', '120 de rețete'])
  })

  for (const style of ['classic', 'evening'] as const) {
    it(`makes a ${style} book: cover, contents with links, a page per recipe, long ones continue`, async () => {
      const long = recipe('3', 'Tocăniță 🍲', 'Feluri principale', {
        ingredients: Array.from({ length: 40 }, (_, i) => `${i + 1} ingredient de test destul de lung`),
        steps: Array.from({ length: 16 }, () => 'Un pas lung care ocupă mai multe rânduri ca să treacă rețeta pe pagina următoare.'),
        nutrition: { kcal: 320, protein: 20, carbs: 30, fat: 10 },
      })
      const { bytes, pages } = await buildCookbook({
        recipes: [recipe('1', 'Ciorbă', 'Ciorbe și supe'), { ...recipe('2', 'Clătite', 'Deserturi'), favorite: true, cooked: 4, notes: [{ day: '2026-10-12', text: 'Mai multă dulceață', by: 'Loredana' }] }, long],
        style, fonts, authors: 'Sorin și Loredana', date: new Date('2026-11-10'),
      })
      expect(pages).toBe(1 + 1 + 1 + 1 + 4) // cover, contents, two short recipes, the long one on four A5 pages
      const doc = await PDFDocument.load(bytes)
      expect(doc.getTitle()).toBe('Rețetele noastre')
      const links = doc.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray)
      expect(links.size()).toBe(3)
    })
  }
})
