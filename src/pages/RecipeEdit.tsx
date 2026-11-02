import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getRecipe, newId, saveRecipe } from '../lib/db'
import { parseRecipeText } from '../lib/parseRecipe'
import type { Recipe } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'

const CATEGORIES = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']

const empty = (): Recipe => ({
  id: newId(), title: '', category: '', ingredients: [], steps: [], createdAt: Date.now(), updatedAt: Date.now(),
})

export default function RecipeEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe>()
  const [ing, setIng] = useState('')
  const [steps, setSteps] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  useEffect(() => {
    if (!id) { setR(empty()); return }
    getRecipe(id).then((x) => {
      const rec = x ?? empty()
      setR(rec); setIng(rec.ingredients.join('\n')); setSteps(rec.steps.join('\n'))
    })
  }, [id])
  const img = useBlobUrl(r?.photo)
  if (!r) return null

  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setR({ ...r, [k]: v })
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

  const applyPaste = () => {
    const p = parseRecipeText(paste)
    setR({ ...r, title: r.title || p.title })
    setIng(p.ingredients.join('\n')); setSteps(p.steps.join('\n'))
    setShowPaste(false); setPaste('')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!r.title.trim()) return
    await saveRecipe({ ...r, title: r.title.trim(), ingredients: lines(ing), steps: lines(steps) })
    nav(`/retete/${r.id}`, { replace: true })
  }

  return (
    <form className="form" onSubmit={save}>
      <h1>{id ? 'Editează rețeta' : 'Rețetă nouă'}</h1>

      {!id && (
        showPaste ? (
          <div className="paste">
            <label>Lipește textul rețetei (titlul pe primul rând)</label>
            <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)}
              placeholder={'Sarmale\nIngrediente\n- 1 varză murată\n- 500 g carne tocată\nMod de preparare\n1. ...'} />
            <div className="row"><button type="button" className="btn primary" onClick={applyPaste}>Completează automat</button>
              <button type="button" className="btn" onClick={() => setShowPaste(false)}>Renunță</button></div>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setShowPaste(true)}>📋 Lipește o rețetă din text</button>
        )
      )}

      <label>Titlu<input required value={r.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label>Categorie
        <input list="cats" value={r.category} onChange={(e) => set('category', e.target.value)} />
        <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="row">
        <label>Porții<input type="number" min={1} value={r.servings ?? ''} onChange={(e) => set('servings', e.target.value ? +e.target.value : undefined)} /></label>
        <label>Minute<input type="number" min={1} value={r.minutes ?? ''} onChange={(e) => set('minutes', e.target.value ? +e.target.value : undefined)} /></label>
      </div>
      <label>Poză
        <input type="file" accept="image/*" capture="environment" onChange={(e) => set('photo', e.target.files?.[0])} />
      </label>
      {img && <img className="preview" src={img} alt="" />}
      <label>Ingrediente (unul pe rând)<textarea rows={6} value={ing} onChange={(e) => setIng(e.target.value)} /></label>
      <label>Mod de preparare (un pas pe rând)<textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
      <label>Note<textarea rows={3} value={r.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
      <label>Link sursă<input type="url" value={r.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value || undefined)} /></label>
      <div className="row">
        <button className="btn primary" type="submit">Salvează</button>
        <button className="btn" type="button" onClick={() => nav(-1)}>Anulează</button>
      </div>
    </form>
  )
}
