import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { scaleIngredient } from '../lib/scale'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { formatMinutes } from '../lib/format'
import { getProgress } from '../lib/cooking'
import Sheet from '../components/Sheet'
import { LoadError, Loading } from '../components/LoadState'
import { useSyncedList } from '../lib/synced'
import { addDays, addToShopping, dayKey, dayName, planRecipe, planStore, shortDate, today } from '../lib/plan'

/** Choose a day in the next two weeks; days that already have this recipe are marked. */
function DayPicker({ r, servings, onDone, onClose }: { r: Recipe; servings?: number; onDone: (msg: string) => void; onClose: () => void }) {
  const plan = useSyncedList(planStore)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i))
  return (
    <Sheet title="Când o gătești?" onClose={onClose}>
      <ul className="pick-list day-pick">
        {days.map((d, i) => {
          const k = dayKey(d)
          const planned = plan.some((e) => e.day === k && e.recipeId === r.id)
          return (
            <li key={k}>
              <button type="button" onClick={() => { planRecipe(r, k, servings); onDone(`Adăugată ${i === 0 ? 'azi' : i === 1 ? 'mâine' : `${dayName(d).toLowerCase()}, ${shortDate(d)}`}.`) }}>
                <span><b>{i === 0 ? 'Azi' : i === 1 ? 'Mâine' : dayName(d)}</b> <small>{shortDate(d)}</small></span>
                {planned && <small className="day-pick-on">deja în plan</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

export default function RecipeView() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe | null>()
  const [have, setHave] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<Set<number>>(new Set())
  const [servings, setServings] = useState<number>()
  const [confirming, setConfirming] = useState(false)
  const [menu, setMenu] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [note, setNote] = useState<{ text: string; to: string; link: string }>()
  const [failed, setFailed] = useState(false)
  const load = () => {
    getRecipe(id!).then((x) => { setR(x ?? null); setServings(x?.servings) }).catch(() => setFailed(true))
  }
  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const img = useFileUrl(r?.photoKey)
  if (failed) return <LoadError text="Nu am putut deschide rețeta. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
  if (r === undefined) return <Loading />
  if (r === null) return (
    <div className="not-found">
      <h1>Rețeta nu a fost găsită</h1>
      <p>Poate a fost ștearsă.</p>
      <Link to="/retete" className="btn primary">Rețetele mele</Link>
    </div>
  )

  const toggle = (set: typeof setHave) => (i: number) => set((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const factor = r.servings && servings ? servings / r.servings : 1

  return (
    <article className="recipe">
      <div className="recipe-hero">
        {img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}
        <button type="button" className="hero-more" aria-label="Opțiuni rețetă" onClick={() => setMenu(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </div>
      <div className="recipe-sheet">
        <h1>{r.title}</h1>
        <div className="pills">
          {r.minutes ? <span className="pill">{formatMinutes(r.minutes)}</span> : null}
          {r.category && <span className="pill">{r.category}</span>}
        </div>

        {r.steps.length > 0 && (() => {
          const saved = getProgress(r.id)
          return (
            <Link to={`/retete/${r.id}/gateste`} className="btn primary big cook-cta">
              {saved != null && saved > 0 && saved < r.steps.length ? `Continuă de la pasul ${saved + 1}` : 'Gătește pas cu pas'}
            </Link>
          )
        })()}

        <div className="recipe-plan-actions">
          <button type="button" className="btn" onClick={() => setPlanning(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4" /></svg>
            Adaugă în săptămână
          </button>
          {r.ingredients.length > 0 && (
            <button type="button" className="btn" onClick={() => {
              // Ingredients ticked as "I have it" stay off the list.
              const need = r.ingredients.filter((_, i) => !have.has(i))
              const n = addToShopping(r, servings, need)
              setNote({ text: n ? `Am pus ${n} ${n === 1 ? 'ingredient' : 'ingrediente'} în listă.` : 'Sunt deja în listă.', to: '/cumparaturi', link: 'Vezi lista' })
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20.5h.01M17 20.5h.01" /></svg>
              Pune în listă{have.size > 0 && r.ingredients.length > have.size ? ` (${r.ingredients.length - have.size})` : ''}
            </button>
          )}
          {note && <p className="recipe-plan-note" role="status">{note.text} <Link to={note.to}>{note.link}</Link></p>}
        </div>
        {have.size > 0 && <small className="recipe-plan-hint">Ce ai bifat la ingrediente nu ajunge în lista de cumpărături.</small>}

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

      </div>
      {menu && (
        <Sheet title="Rețeta" onClose={() => { setMenu(false); setConfirming(false) }}>
          <div className="menu-list">
            <Link to={`/retete/${r.id}/editeaza`} className="btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>
              Editează rețeta
            </Link>
            {confirming ? (
              <div className="menu-confirm">
                <p>Ștergi rețeta „{r.title}”? Nu se mai poate recupera.</p>
                <button type="button" className="btn danger" onClick={async () => { await deleteRecipe(r); nav('/retete') }}>Da, șterge</button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>Nu</button>
              </div>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                Șterge rețeta
              </button>
            )}
          </div>
        </Sheet>
      )}
      {planning && <DayPicker r={r} servings={servings} onClose={() => setPlanning(false)} onDone={(text) => { setPlanning(false); setNote({ text, to: '/saptamana', link: 'Vezi săptămâna' }) }} />}
    </article>
  )
}
