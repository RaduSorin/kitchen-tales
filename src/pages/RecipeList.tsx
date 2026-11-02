import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { formatMinutes, norm } from '../lib/format'
import { LoadError, Loading } from '../components/LoadState'

export function RecipeRow({ r }: { r: Recipe }) {
  const img = useFileUrl(r.photoKey)
  const meta = [r.category, r.minutes && formatMinutes(r.minutes), r.servings && `${r.servings} porții`].filter(Boolean).join(' · ')
  return (
    <Link to={`/retete/${r.id}`} className="recipe-row">
      <div className="recipe-thumb">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}</div>
      <div className="recipe-row-text">
        <span className="recipe-row-title">{r.title}</span>
        {meta && <small>{meta}</small>}
      </div>
    </Link>
  )
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const load = () => {
    listRecipes().then(setRecipes).catch(() => setFailed(true)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const cats = useMemo(() => [...new Set(recipes.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), [recipes])
  const shown = recipes
    .filter((r) => {
      if (cat && r.category !== cat) return false
      if (!q) return true
      return norm([r.title, r.category, ...r.ingredients].join(' ')).includes(norm(q))
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'ro'))

  return (
    <section className="recipes">
      <div className="recipes-head">
        <h1>Rețetele mele</h1>
        <Link to="/retete/noua" className="btn primary new-recipe" aria-label="Rețetă nouă" title="Rețetă nouă"><span aria-hidden="true">+</span><span className="new-recipe-text" aria-hidden="true"> Rețetă nouă</span></Link>
      </div>
      <label className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input type="search" id="recipe-search" aria-label="Caută rețete" placeholder="Caută după nume sau ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {cats.length > 0 && (
        <div className="cat-tabs" role="group" aria-label="Categorii">
          <button type="button" aria-pressed={!cat} onClick={() => setCat('')}>Toate</button>
          {cats.map((c) => (
            <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}
      {loading ? <Loading /> : failed ? <LoadError text="Nu am putut încărca rețetele. Verifică internetul." onRetry={() => { setLoading(true); setFailed(false); load() }} /> : recipes.length === 0 ? (
        <p className="empty">Nicio rețetă încă. Adaugă prima ta rețetă!</p>
      ) : shown.length === 0 ? (
        <p className="empty">Nicio rețetă nu se potrivește cu „{q}”.</p>
      ) : (
        <div className="recipe-rows">{shown.map((r) => <RecipeRow key={r.id} r={r} />)}</div>
      )}
    </section>
  )
}
