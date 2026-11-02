import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listRecipes, listStories } from '../lib/db'
import type { Recipe, Story } from '../lib/types'
import { norm } from '../lib/format'
import StoryCover from '../components/StoryCover'
import { RecipeRow } from './RecipeList'

/** One search for everything: recipes by name, category or ingredient, and stories by title. */
export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const setQ = (v: string) => setParams(v ? { q: v } : {}, { replace: true })
  const [recipes, setRecipes] = useState<Recipe[]>()
  const [stories, setStories] = useState<Story[]>([])
  useEffect(() => {
    listRecipes().then(setRecipes).catch(() => setRecipes([]))
    listStories().then(setStories).catch(() => {})
  }, [])

  const cats = useMemo(() => [...new Set((recipes ?? []).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), [recipes])
  const words = norm(q.trim()).split(/\s+/).filter(Boolean)
  // Every word must match somewhere, so "pui cartofi" finds dishes with both.
  const hit = (text: string) => { const t = norm(text); return words.every((w) => t.includes(w)) }
  const foundRecipes = words.length ? (recipes ?? []).filter((r) => hit([r.title, r.category, ...r.ingredients].join(' '))).sort((a, b) => a.title.localeCompare(b.title, 'ro')) : []
  const foundStories = words.length ? stories.filter((s) => hit(s.title)) : []

  return (
    <section className="search-page">
      <h1>Caută</h1>
      <label className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input type="search" autoFocus aria-label="Caută" placeholder="Rețetă, ingredient sau poveste" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {!words.length ? (
        <>
          {cats.length > 0 && (
            <>
              <h2>Categorii</h2>
              <div className="search-cats">{cats.map((c) => <button key={c} type="button" className="chip" onClick={() => setQ(c)}>{c}</button>)}</div>
            </>
          )}
          <Link to="/retete/noua?din=frigider" className="search-fridge">
            <b>Nu știi ce să gătești?</b>
            <small>Spune ce ai în frigider și primești idei de rețete</small>
          </Link>
        </>
      ) : recipes === undefined ? <p className="empty">Se încarcă…</p> : !foundRecipes.length && !foundStories.length ? (
        <p className="empty">Nimic nu se potrivește cu „{q}”.</p>
      ) : (
        <>
          {foundRecipes.length > 0 && (
            <>
              <h2>Rețete <small className="count">{foundRecipes.length}</small></h2>
              <div className="recipe-rows">{foundRecipes.map((r) => <RecipeRow key={r.id} r={r} />)}</div>
            </>
          )}
          {foundStories.length > 0 && (
            <>
              <h2>Povești <small className="count">{foundStories.length}</small></h2>
              <div className="search-stories">
                {foundStories.map((s) => (
                  <Link key={s.id} to={`/povesti/${s.id}`} className="search-story">
                    <StoryCover story={s} />
                    <span>{s.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
