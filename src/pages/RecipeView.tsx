import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'

export default function RecipeView() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe | null>()
  const [done, setDone] = useState<Set<number>>(new Set())
  useEffect(() => { getRecipe(id!).then((x) => setR(x ?? null)) }, [id])
  const img = useBlobUrl(r?.photo)
  if (r === undefined) return null
  if (r === null) return <p className="empty">Rețeta nu a fost găsită.</p>

  const toggle = (i: number) => setDone((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })

  return (
    <article className="recipe">
      {img && <img className="hero" src={img} alt="" />}
      <h1>{r.title}</h1>
      <p className="meta">{[r.category, r.servings && `${r.servings} porții`, r.minutes && `${r.minutes} min`].filter(Boolean).join(' · ')}</p>
      <h2>Ingrediente</h2>
      <ul className="ingredients">{r.ingredients.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <h2>Mod de preparare</h2>
      <ol className="steps">
        {r.steps.map((x, i) => (
          <li key={i} className={done.has(i) ? 'done' : ''} onClick={() => toggle(i)}>{x}</li>
        ))}
      </ol>
      {r.notes && (<><h2>Note</h2><p className="notes">{r.notes}</p></>)}
      {r.sourceUrl && <p><a href={r.sourceUrl} target="_blank" rel="noreferrer">Sursa originală</a></p>}
      <div className="row">
        <Link to={`/retete/${r.id}/editeaza`} className="btn primary">Editează</Link>
        <button className="btn danger" onClick={async () => {
          if (confirm(`Ștergi rețeta „${r.title}”?`)) { await deleteRecipe(r.id); nav('/retete') }
        }}>Șterge</button>
      </div>
    </article>
  )
}
