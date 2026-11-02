import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes } from '../lib/db'
import type { PlanEntry, Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { norm } from '../lib/format'
import { useSyncedList } from '../lib/synced'
import { addDays, addToShopping, dayKey, dayName, mondayOf, planRecipe, planStore, shortDate, today, weekDays, weekLabel } from '../lib/plan'
import PlatePlaceholder from '../components/PlatePlaceholder'
import Sheet from '../components/Sheet'

const Chevron = ({ left }: { left?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
)

function Thumb({ r }: { r?: Recipe }) {
  const img = useFileUrl(r?.photoKey)
  return img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r?.title ?? ''} />
}

function Planned({ e, r, loaded }: { e: PlanEntry; r?: Recipe; loaded: boolean }) {
  const body = (
    <>
      <span className="planned-thumb"><Thumb r={r} /></span>
      <span className="planned-title">{r?.title ?? (loaded ? 'Rețetă ștearsă' : '…')}{e.servings ? <small> · {e.servings} porții</small> : null}</span>
    </>
  )
  return (
    <li className="planned">
      {r ? <Link to={`/retete/${r.id}`} className="planned-link">{body}</Link> : <span className="planned-link">{body}</span>}
      <button type="button" className="planned-remove" onClick={() => planStore.remove(e.id)} aria-label={`Scoate ${r?.title ?? 'rețeta'} din ziua asta`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </li>
  )
}

function RecipePicker({ day, recipes, onClose }: { day: Date; recipes: Recipe[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const shown = recipes.filter((r) => !q || norm([r.title, r.category, ...r.ingredients].join(' ')).includes(norm(q.trim())))
    .sort((a, b) => a.title.localeCompare(b.title, 'ro'))
  return (
    <Sheet title={`${dayName(day)}, ${shortDate(day)}`} onClose={onClose}>
      <label className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input type="search" aria-label="Caută rețete" placeholder="Caută o rețetă" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {recipes.length === 0 ? (
        <p className="empty">Nicio rețetă încă. <Link to="/retete/noua">Adaugă una</Link></p>
      ) : (
        <ul className="pick-list">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { planRecipe(r, dayKey(day)); onClose() }}>
                <span className="planned-thumb"><Thumb r={r} /></span>
                <span>{r.title}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="empty">Nicio rețetă nu se potrivește.</li>}
        </ul>
      )}
    </Sheet>
  )
}

export default function Week() {
  const [monday, setMonday] = useState(() => mondayOf(today()))
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [picking, setPicking] = useState<Date>()
  const [note, setNote] = useState('')
  const plan = useSyncedList(planStore)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { listRecipes().then((xs) => { setRecipes(xs); setLoaded(true) }).catch(() => {}) }, [])
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])

  const days = weekDays(monday)
  const todayKey = dayKey(today())
  const keys = new Set(days.map(dayKey))
  const inWeek = plan.filter((e) => keys.has(e.day))

  const shopWeek = () => {
    let added = 0
    for (const e of inWeek) {
      const r = byId.get(e.recipeId)
      if (r) added += addToShopping(r, e.servings ?? r.servings)
    }
    setNote(added ? `Am pus ${added} ${added === 1 ? 'ingredient' : 'ingrediente'} în lista de cumpărături.` : 'Ingredientele sunt deja în listă.')
  }

  return (
    <section className="week">
      <div className="recipes-head"><h1>Săptămâna mea</h1></div>
      <div className="week-nav">
        <button type="button" className="week-arrow" onClick={() => { setMonday(addDays(monday, -7)); setNote('') }} aria-label="Săptămâna trecută"><Chevron left /></button>
        <div className="week-nav-label">
          <b>{weekLabel(monday)}</b>
          <small>{shortDate(days[0])} – {shortDate(days[6])}</small>
        </div>
        <button type="button" className="week-arrow" onClick={() => { setMonday(addDays(monday, 7)); setNote('') }} aria-label="Săptămâna viitoare"><Chevron /></button>
      </div>
      {dayKey(monday) !== dayKey(mondayOf(today())) && (
        <button type="button" className="link-btn week-today" onClick={() => setMonday(mondayOf(today()))}>Înapoi la săptămâna asta</button>
      )}

      <ol className="week-days">
        {days.map((d) => {
          const k = dayKey(d)
          const entries = plan.filter((e) => e.day === k)
          return (
            <li key={k} className={`week-day${k === todayKey ? ' today' : ''}${k < todayKey ? ' past' : ''}`}>
              <div className="week-day-head">
                <span><b>{dayName(d)}</b> <small>{shortDate(d)}{k === todayKey ? ' · azi' : ''}</small></span>
                <button type="button" className="btn small" onClick={() => setPicking(d)}>+ Adaugă</button>
              </div>
              {entries.length > 0 && <ul className="planned-list">{entries.map((e) => <Planned key={e.id} e={e} r={byId.get(e.recipeId)} loaded={loaded} />)}</ul>}
            </li>
          )
        })}
      </ol>

      {inWeek.length > 0 && (
        <div className="week-shop">
          <button type="button" className="btn primary big" onClick={shopWeek}>Pune ingredientele săptămânii în listă</button>
          {note && <p className="week-note">{note} <Link to="/cumparaturi">Vezi lista</Link></p>}
        </div>
      )}

      {picking && <RecipePicker day={picking} recipes={recipes} onClose={() => setPicking(undefined)} />}
    </section>
  )
}
