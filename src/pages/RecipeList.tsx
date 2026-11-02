import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'

function Card({ r }: { r: Recipe }) {
  const img = useBlobUrl(r.photo)
  return (
    <Link to={`/retete/${r.id}`} className="card">
      <div className="card-img">{img ? <img src={img} alt="" /> : <span>🍽️</span>}</div>
      <div className="card-body">
        <strong>{r.title}</strong>
        <small>{[r.category, r.minutes && `${r.minutes} min`].filter(Boolean).join(' · ')}</small>
      </div>
    </Link>
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  useEffect(() => { listRecipes().then(setRecipes) }, [])

  const cats = useMemo(() => [...new Set(recipes.map((r) => r.category).filter(Boolean))].sort(), [recipes])
  const shown = recipes.filter((r) => {
    if (cat && r.category !== cat) return false
    if (!q) return true
    return norm([r.title, r.category, ...r.ingredients].join(' ')).includes(norm(q))
  })

  return (
    <section>
      <div className="row between">
        <h1>Rețete</h1>
        <Link to="/retete/noua" className="btn primary">+ Rețetă nouă</Link>
      </div>
      <input className="search" placeholder="Caută după nume sau ingredient…" value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 0 && (
        <div className="chips">
          <button className={!cat ? 'chip on' : 'chip'} onClick={() => setCat('')}>Toate</button>
          {cats.map((c) => (
            <button key={c} className={cat === c ? 'chip on' : 'chip'} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}
      {recipes.length === 0 ? (
        <p className="empty">Nicio rețetă încă. Adaugă prima ta rețetă!</p>
      ) : (
        <div className="grid">{shown.map((r) => <Card key={r.id} r={r} />)}</div>
      )}
    </section>
  )
}
