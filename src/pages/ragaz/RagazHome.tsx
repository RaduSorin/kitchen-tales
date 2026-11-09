import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { lockVault } from '../../lib/mind/vault'
import { dayName, fridaysOf, monthName, nextMonth, thisMonth, today, type MonthPlan, type Note } from '../../lib/mind/model'
import { getMonth, listMonths, listNotes, rememberPlanned } from '../../lib/mind/store'
import '../../ragaz.css'

const CHECK = 'M5 12.5l4.5 4.5L19 7'

/** /ragaz: the month's intention on top, then its Fridays, the journal and the bank. */
export default function RagazHome() {
  const [data, setData] = useState<{ month?: MonthPlan; next?: MonthPlan; notes: Note[] }>()
  useEffect(() => {
    const id = thisMonth()
    Promise.all([getMonth(id), getMonth(nextMonth(id)), listNotes()])
      .then(([month, next, notes]) => setData({ month, next, notes }), (e: Error) => showToast(e.message))
    // For the Home card: which months are planned (also for plans made before it kept track).
    listMonths().then(rememberPlanned).catch(() => {})
  }, [])
  if (!data) return <Loading />
  const { month, next, notes } = data
  const day = today()
  const id = thisMonth()
  const done = new Set(notes.filter((n) => n.date.startsWith(id)).map((n) => n.date))
  // The next month can be planned once this one has no Friday left (or a week before it ends).
  const fridaysLeft = fridaysOf(id, day).length
  const planNext = !next && (!fridaysLeft || Number(day.slice(8)) >= 24)

  return (
    <section className="ragaz rg-home">
      <div className="rg-head">
        <div>
          <span className="cs-kicker">Răgaz · {monthName(id)}</span>
          <h1>Luna mea</h1>
        </div>
        <button type="button" className="night-btn" aria-label="Blochează Răgaz" onClick={lockVault}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
        </button>
      </div>

      {month ? (
        <Link to={`/ragaz/planifica?luna=${id}`} className="rg-intent">
          <span className="rg-label">Intenția lunii</span>
          <p className="on">{month.intention}</p>
          {month.success && <small>Semnul: {month.success}{month.target && month.fridays.length ? ` · îmi ajung ${month.target} din ${month.fridays.length} vineri` : ''}</small>}
        </Link>
      ) : (
        <div className="rg-intent">
          <span className="rg-label">Intenția lunii</span>
          <p>Încă n-ai ales ce vrei să-ți dai în {monthName(id)}.</p>
          <Link to={`/ragaz/planifica?luna=${id}`} className="moon-btn rg-wide">Planifică luna</Link>
        </div>
      )}

      {month && month.fridays.length > 0 && (
        <div className="rg-sec">
          <h2 className="rg-label">Vinerile lunii</h2>
          {month.fridays.map((f) => {
            const past = f.date < day
            const isNext = !past && f.date === month.fridays.find((x) => x.date >= day)?.date
            return (
              <Link key={f.date} to={`/ragaz/vineri/${f.date}`} className={`rg-fri${isNext ? ' next' : ''}${past ? ' past' : ''}`}>
                <span className="rg-fri-date">{dayName(f.date)}</span>
                <span className="rg-fri-title">{f.title || 'Liber'}</span>
                {done.has(f.date) && <svg className="rg-fri-done" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Nota e scrisă"><path d={CHECK} /></svg>}
              </Link>
            )
          })}
        </div>
      )}

      {planNext && (
        <Link to={`/ragaz/planifica?luna=${nextMonth(id)}`} className="rg-card rg-link">
          <div><b>Planifică {monthName(nextMonth(id))}</b><small>Intenția și temele de vineri pentru luna care vine.</small></div>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      <div className="rg-two">
        <Link to="/ragaz/griji" className="rg-tile"><b>Lista de griji</b><small>piatră și plastilină</small></Link>
        <Link to="/ragaz/reflectie" className="rg-tile"><b>Reflecția lunii</b><small>ce a funcționat</small></Link>
        <Link to="/ragaz/jurnal" className="rg-tile"><b>Jurnal</b><small>{notes.length ? `${notes.length} ${notes.length === 1 ? 'notă' : 'note'}` : 'gol încă'}</small></Link>
        <Link to="/ragaz/exercitii" className="rg-tile"><b>Exercițiile mele</b><small>pachete și banca ta</small></Link>
      </div>
      <Link to="/ragaz/claude" className="rg-card rg-link">
        <div><b>Vorbește cu Claude</b><small>Opțional. Pleacă doar ce trimiți tu.</small></div>
        <span aria-hidden="true">›</span>
      </Link>
      <Link to="/profil/ragaz" className="link-btn rg-alt">Setări Răgaz ›</Link>
    </section>
  )
}
