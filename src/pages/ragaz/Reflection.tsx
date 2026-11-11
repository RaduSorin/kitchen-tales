import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { dayName, monthId, monthName, nextMonth, thisMonth, today, type MonthPlan, type Note } from '../../lib/mind/model'
import { getMonth, listNotes, saveNote } from '../../lib/mind/store'
import { monthSummary } from '../../lib/mind/stats'
import '../../ragaz.css'

const QUESTIONS: [string, string][] = [
  ['changed', 'Ce s-a schimbat luna asta?'],
  ['worked', 'Ce a funcționat?'],
  ['avoid', 'Ce evit?'],
  ['keep', 'Ce păstrez și ce schimb luna viitoare?'],
]

/** The month to look back on: the one that just ended in its first week, else this one. */
function defaultMonth() {
  const d = new Date()
  return d.getDate() <= 7 ? monthId(new Date(d.getFullYear(), d.getMonth() - 1, 1)) : thisMonth()
}

/**
 * /ragaz/reflectie: the monthly reflection. A summary computed only from the structured part of
 * the notes, the month's notes to reread, four fixed questions, then the next month's intention.
 */
export default function Reflection() {
  const [params] = useSearchParams()
  const asked = params.get('luna')
  const id = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : defaultMonth()
  const nav = useNavigate()
  const [data, setData] = useState<{ plan?: MonthPlan; notes: Note[]; had?: Note }>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [reread, setReread] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    Promise.all([getMonth(id), listNotes()]).then(([plan, all]) => {
      const notes = all.filter((n) => n.month === id)
      const had = notes.find((n) => n.kind === 'reflection')
      if (had?.answers) setAnswers(had.answers)
      setData({ plan, notes: notes.filter((n) => n.kind !== 'reflection'), had })
    }, (e: Error) => showToast(e.message))
  }, [id])
  if (!data) return <Loading />
  const { plan, notes, had } = data
  const s = monthSummary(plan, notes)
  const next = nextMonth(id)

  const save = async () => {
    setBusy(true)
    try {
      const text = QUESTIONS.filter(([k]) => answers[k]?.trim()).map(([k, q]) => `${q}\n${answers[k].trim()}`).join('\n\n')
      await saveNote({ ...(had ?? { id: crypto.randomUUID(), date: today(), month: id, createdAt: Date.now() }), kind: 'reflection', title: `Reflecția lunii ${monthName(id)}`, answers, text })
      showToast('Reflecția e în jurnal.')
      nav(`/ragaz/planifica?luna=${next}`)
    } catch (e) {
      showToast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className="ragaz rg-page">
      <div className="rg-head">
        <div><span className="cs-kicker">Reflecția lunii</span><h1>{monthName(id)[0].toUpperCase() + monthName(id).slice(1)}</h1></div>
      </div>
      {plan?.intention && <div className="rg-intent small"><span className="rg-label">Intenția ta</span><p>{plan.intention}</p>{plan.success && <small>Semnul: {plan.success}</small>}</div>}

      <div className="rg-sec">
        <h2 className="rg-label">Pe scurt</h2>
        <div className="rg-stats">
          <div><b>{s.done}{s.fridays ? ` din ${s.fridays}` : ''}</b><small>vineri cu exercițiul făcut{s.target ? ` · ținta ta: ${s.target}` : ''}</small></div>
          {s.reached && <div><b>Da</b><small>ai ajuns unde ți-ai propus</small></div>}
          {s.worryLists > 0 && <div><b>{s.worryLists}</b><small>{s.worryLists === 1 ? 'listă de griji' : 'liste de griji'}</small></div>}
        </div>
        {s.helped.length > 0 && (
          <div className="rg-card"><div><b>Ce a ajutat cel mai mult</b><small>{s.helped.map((t) => `${t.title} (intensitatea a scăzut în medie cu ${t.avgDrop})`).join('; ')}</small></div></div>
        )}
        {s.poorFit.length > 0 && (
          <div className="rg-card"><div><b>Unde nu s-a potrivit</b><small>{s.poorFit.map((t) => t.title).join('; ')}. Poate le schimbi sau le scoți din bancă.</small></div></div>
        )}
        {!s.tools.length && <p className="set-hint">Nu sunt încă note de după exerciții luna asta. Rezumatul se face doar din cifrele și etichetele lor, niciodată din text.</p>}
      </div>

      {notes.length > 0 && (
        <div className="rg-sec">
          <button type="button" className="link-btn" onClick={() => setReread(!reread)}>{reread ? 'Ascunde notele lunii' : `Recitește notele lunii (${notes.length})`}</button>
          {reread && notes.map((n) => (
            <div className="rg-entry" key={n.id}>
              <small>{dayName(n.date)}{n.title ? ` · ${n.title}` : ''}</small>
              {n.text && <p>{n.text}</p>}
            </div>
          ))}
        </div>
      )}

      {plan?.success && (
        <div className="rg-sec">
          <h2 className="rg-label">Semnul tău</h2>
          <p className="rg-sub">Ți-ai ales semnul „{plan.success}”. L-ai văzut luna asta, măcar o dată?</p>
          <div className="pills" role="group" aria-label="Ai văzut semnul?">
            {([['da', 'Da'], ['nu', 'Nu de data asta']] as const).map(([v, label]) => (
              <button type="button" key={v} aria-pressed={answers.sign === v}
                onClick={() => setAnswers({ ...answers, sign: answers.sign === v ? '' : v })}>{label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="rg-sec">
        <h2 className="rg-label">Întrebările lunii</h2>
        {QUESTIONS.map(([k, q]) => (
          <label className="night-field" key={k}>{q}
            <textarea className="cs-text" rows={3} value={answers[k] ?? ''} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
          </label>
        ))}
      </div>

      <button type="button" className="moon-btn rg-wide" disabled={busy} onClick={save}>{busy ? 'Se salvează…' : `Salvează și alege intenția pentru ${monthName(next)}`}</button>
      <Link to="/ragaz" className="link-btn rg-alt">Mai târziu</Link>
    </section>
  )
}
