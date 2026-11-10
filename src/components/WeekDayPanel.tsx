import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PlanEntry, Recipe } from '../lib/types'
import { addToShopping, dayName, planRecipe, planStore } from '../lib/plan'
import { formatMinutes } from '../lib/format'
import { showToast } from '../lib/toast'
import Sheet from './Sheet'

/**
 * Acasă › Săptămâna, concept "Cercuri + ziua aleasă": the seven round day plates stay as they
 * are, and tapping one shows that day right under them, on the same page. A planned day lists
 * its dishes (tap one for Gătește · Pe listă · Mută · Scoate); a free day offers three dishes
 * from the notebook, each one tap away from that day. Today is chosen when the tab opens.
 */
type Day = { key: string; d: Date; r?: Recipe }

const SHORT = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D']
const ABBR = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum']
const Ic = ({ d, size = 17 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const IC = {
  chef: 'M7 14.5a4 4 0 0 1-.5-7.9 5.5 5.5 0 0 1 11 0 4 4 0 0 1-.5 7.9V19H7zM7 16.5h10',
  cart: 'M3 4.5h2.5l2 10.5h10l2-7.5H7M9 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM16.5 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
  cal: 'M7 5.5h10a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8.5a3 3 0 0 1 3-3zM4 10h16M8.5 3.5V7M15.5 3.5V7',
  trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13',
  plus: 'M12 5v14M5 12h14',
  chev: 'm9.5 5.5 6.5 6.5-6.5 6.5',
}

export default function WeekDayPanel({ week, todayKey, plan, byId, ideas, thumb }: {
  week: Day[]
  todayKey: string
  plan: PlanEntry[]
  byId: Map<string, Recipe>
  /** Dishes to suggest for a free day, best first. */
  ideas: (dayKey: string) => { r: Recipe; last: string }[]
  thumb: (r: Recipe) => ReactNode
}) {
  const [picked, setPicked] = useState(todayKey)
  const [open, setOpen] = useState<string>()
  const [moving, setMoving] = useState<PlanEntry>()
  const i = Math.max(0, week.findIndex((w) => w.key === picked))
  const day = week[i] ?? week[0]
  const isToday = day.key === todayKey
  const entries = plan.filter((e) => e.day === day.key && byId.has(e.recipeId))
  const label = isToday ? 'Azi' : dayName(day.d)
  const date = day.d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })
  const free = isToday ? 'azi' : ABBR[i].toLowerCase()

  const remove = (e: PlanEntry, r: Recipe) => {
    planStore.remove(e.id)
    setOpen(undefined)
    showToast(`Am scos ${r.title}`, () => planStore.create(e))
  }
  const toList = (e: PlanEntry, r: Recipe) => {
    const n = addToShopping(r, e.servings ?? r.servings)
    showToast(n ? `Am pus ${n} ${n === 1 ? 'ingredient' : 'ingrediente'} pe listă` : 'Ingredientele sunt deja pe listă')
  }

  return (
    <div className="wd">
      <div className="vt-week" role="group" aria-label="Zilele săptămânii">
        {week.map(({ key, d, r }, k) => {
          const today = key === todayKey
          const name = d.toLocaleDateString('ro-RO', { weekday: 'long' })
          return (
            <button key={key} type="button" aria-pressed={key === day.key} onClick={() => { setPicked(key); setOpen(undefined) }}
              className={'vt-day' + (today ? ' today' : '') + (key === day.key ? ' picked' : '')}
              aria-label={r ? `${name}: ${r.title}` : `${name}: nimic planificat`}>
              <span className={r ? 'vt-plate' : 'vt-plate free'}>{r ? thumb(r) : '+'}</span>
              <small>{today ? 'Azi' : SHORT[k]}</small>
            </button>
          )
        })}
      </div>

      <div className="wd-head">
        <b>{entries.length ? `${label} · ${isToday ? `${dayName(day.d).toLowerCase()} ${day.d.getDate()}` : date}` : `${label} e liberă`}</b>
        <small>{entries.length ? `${entries.length} ${entries.length === 1 ? 'fel' : 'feluri'}` : date}</small>
      </div>

      {entries.length > 0 ? (
        <ul className="home-rows wd-list">
          {entries.map((e) => {
            const r = byId.get(e.recipeId)!
            const on = open === e.id
            const meta = e.leftovers ? 'Resturi · nu trebuie gătit' : [r.minutes && formatMinutes(r.minutes), (e.servings ?? r.servings) && `${e.servings ?? r.servings} porții`].filter(Boolean).join(' · ')
            return (
              <li key={e.id} className={on ? 'on' : undefined}>
                <div className="wd-row">
                  <button type="button" className="wd-dish" aria-expanded={on} onClick={() => setOpen(on ? undefined : e.id)}>
                    <span className="home-row-img">{thumb(r)}</span>
                    <span className="home-row-text"><b>{r.title}</b>{meta && <small>{meta}</small>}</span>
                    {!(isToday && !e.leftovers) && <span className="wd-chev"><Ic d={IC.chev} size={18} /></span>}
                  </button>
                  {isToday && !e.leftovers && <Link to={`/retete/${r.id}/gateste`} className="wd-cook"><Ic d={IC.chef} size={15} />Gătește</Link>}
                </div>
                {on && (
                  <div className="wd-acts">
                    <Link to={`/retete/${r.id}/gateste`}><Ic d={IC.chef} />Gătește</Link>
                    <button type="button" onClick={() => toList(e, r)}><Ic d={IC.cart} />Pe listă</button>
                    <button type="button" onClick={() => setMoving(e)}><Ic d={IC.cal} />Mută</button>
                    <button type="button" className="danger" onClick={() => remove(e, r)}><Ic d={IC.trash} />Scoate</button>
                  </div>
                )}
              </li>
            )
          })}
          <li className="wd-more">
            <Link to={`/saptamana?zi=${day.key}`}><Ic d={IC.plus} size={18} />Adaugă încă un fel {free}</Link>
          </li>
        </ul>
      ) : (
        <ul className="home-rows wd-list">
          {ideas(day.key).map(({ r, last }) => (
            <li key={r.id} className="home-idea">
              <Link to={`/retete/${r.id}`}>
                <span className="home-row-img">{thumb(r)}</span>
                <span className="home-row-text"><b>{r.title}</b><small>{[last ? `gătită ultima dată ${new Date(last).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}` : 'încă negătită', r.minutes && formatMinutes(r.minutes)].filter(Boolean).join(' · ')}</small></span>
              </Link>
              <button type="button" className="home-idea-add" aria-label={`Pune ${r.title} ${isToday ? 'azi' : `pe ${dayName(day.d).toLowerCase()}`}`}
                onClick={() => { planRecipe(r, day.key); showToast(`${r.title} e în plan ${isToday ? 'azi' : `${dayName(day.d).toLowerCase()}`}`) }}>
                + {isToday ? 'Azi' : ABBR[i]}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="home-links">
        {entries.length ? <Link to="/saptamana">Toată săptămâna</Link> : <Link to="/retete">Altă rețetă…</Link>}
        <Link to="/saptamana/planifica">Planifică</Link>
      </div>

      {moving && (
        <Sheet title="Pe ce zi o muți?" onClose={() => setMoving(undefined)}>
          <ul className="pick-list day-pick">
            {week.map(({ key, d }) => (
              <li key={key}>
                <button type="button" disabled={key === moving.day} onClick={() => {
                  planStore.update({ ...moving, day: key })
                  setMoving(undefined); setOpen(undefined); setPicked(key)
                  showToast(`Am mutat-o ${key === todayKey ? 'azi' : `pe ${dayName(d).toLowerCase()}`}`)
                }}>
                  <span><b>{key === todayKey ? 'Azi' : dayName(d)}</b> <small>{d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }).replace('.', '')}</small></span>
                  {key === moving.day && <small className="day-pick-on">acum</small>}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  )
}
