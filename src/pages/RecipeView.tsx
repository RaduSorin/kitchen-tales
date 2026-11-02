import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { scaleIngredient } from '../lib/scale'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { formatMinutes } from '../lib/format'

export default function RecipeView() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe | null>()
  const [have, setHave] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<Set<number>>(new Set())
  const [servings, setServings] = useState<number>()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { getRecipe(id!).then((x) => { setR(x ?? null); setServings(x?.servings) }) }, [id])
  const img = useFileUrl(r?.photoKey)
  if (r === undefined) return null
  if (r === null) return <p className="empty">Rețeta nu a fost găsită.</p>

  const toggle = (set: typeof setHave) => (i: number) => set((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const factor = r.servings && servings ? servings / r.servings : 1

  return (
    <article className="recipe">
      <div className="recipe-hero">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}</div>
      <div className="recipe-sheet">
        <h1>{r.title}</h1>
        <div className="pills">
          {r.minutes ? <span className="pill">{formatMinutes(r.minutes)}</span> : null}
          {r.category && <span className="pill">{r.category}</span>}
        </div>

        <div className="recipe-cols">
          <section>
            <div className="section-head">
              <h2>Ingrediente</h2>
              {r.servings && servings ? (
                <div className="stepper" role="group" aria-label="Porții">
                  <button type="button" aria-label="Mai puține porții" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>−</button>
                  <output>{servings} {servings === 1 ? 'porție' : 'porții'}</output>
                  <button type="button" aria-label="Mai multe porții" onClick={() => setServings(servings + 1)}>+</button>
                </div>
              ) : null}
            </div>
            <ul className="checklist">
              {r.ingredients.map((x, i) => (
                <li key={i}>
                  <label className={have.has(i) ? 'done' : ''}>
                    <input type="checkbox" checked={have.has(i)} onChange={() => toggle(setHave)(i)} />
                    <span>{scaleIngredient(x, factor)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Mod de preparare</h2>
            <ol className="step-list">
              {r.steps.map((x, i) => (
                <li key={i} className={done.has(i) ? 'done' : ''}>
                  <button type="button" onClick={() => toggle(setDone)(i)} aria-pressed={done.has(i)}>
                    <span className="step-no">{i + 1}</span>
                    <span>{x}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {r.notes && (<section><h2>Note</h2><p className="notes">{r.notes}</p></section>)}
        {r.sourceUrl && <p><a href={r.sourceUrl} target="_blank" rel="noreferrer">Sursa originală</a></p>}

        <div className="recipe-actions">
          <Link to={`/retete/${r.id}/editeaza`} className="btn">Editează</Link>
          {confirming ? (
            <span className="confirm">
              Ștergi rețeta?
              <button className="btn danger small" onClick={async () => { await deleteRecipe(r); nav('/retete') }}>Da, șterge</button>
              <button className="btn small" onClick={() => setConfirming(false)}>Nu</button>
            </span>
          ) : (
            <button className="btn danger" onClick={() => setConfirming(true)}>Șterge</button>
          )}
        </div>
      </div>
    </article>
  )
}
