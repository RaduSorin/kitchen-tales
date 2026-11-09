import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { dayName, parseDay, today, type Exercise, type MonthPlan, type Note } from '../../lib/mind/model'
import { getExercise, getMonth, listNotes, saveNote } from '../../lib/mind/store'
import '../../ragaz.css'

const FIT: [NonNullable<Note['fit']>, string][] = [['da', 'S-a potrivit'], ['partial', 'Parțial'], ['nu', 'Nu prea']]

/** 0–10 as a row of buttons: easier to hit with a thumb than a slider. */
export function Scale({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="night-field">
      <span>{label}</span>
      <div className="rg-scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} onClick={() => onChange(value === n ? undefined : n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

/** The note after an exercise: how strong it felt before and after, whether it fit, and free text. */
/** `scales`: the before/after intensity, for a note after an exercise (not for a free note). */
export function NoteForm({ note, onSave, busy, scales = true }: { note: Note; onSave: (n: Note) => void; busy?: boolean; scales?: boolean }) {
  const [n, setN] = useState(note)
  const set = (patch: Partial<Note>) => setN({ ...n, ...patch })
  return (
    <div className="rg-note">
      {scales && <>
        <Scale label="Cât de intens era înainte?" value={n.before} onChange={(v) => set({ before: v })} />
        <Scale label="Și după?" value={n.after} onChange={(v) => set({ after: v })} />
      </>}
      {n.exerciseId && (
        <div className="pills" role="radiogroup" aria-label="Cum s-a potrivit">
          {FIT.map(([k, l]) => <button type="button" key={k} aria-pressed={n.fit === k} onClick={() => set({ fit: n.fit === k ? undefined : k })}>{l}</button>)}
        </div>
      )}
      <label className="night-field">Ce am observat
        <textarea className="cs-text" rows={6} value={n.text} onChange={(e) => set({ text: e.target.value })} placeholder="Câteva rânduri, doar pentru tine." />
      </label>
      <button type="button" className="moon-btn rg-wide" disabled={busy} onClick={() => onSave(n)}>{busy ? 'Se salvează…' : 'Salvează în jurnal'}</button>
    </div>
  )
}

/** A real Friday as YYYY-MM-DD (an old or hand-typed link can carry anything). */
const isFriday = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseDay(s).getDay() === 5

/** /ragaz/vineri/:date: the intention, the Friday's exercise, and the note after it. */
export default function Friday() {
  const { date = '' } = useParams()
  return isFriday(date) ? <FridayPage date={date} /> : <Navigate to="/ragaz" replace />
}

function FridayPage({ date }: { date: string }) {
  const nav = useNavigate()
  const [data, setData] = useState<{ month?: MonthPlan; exercise?: Exercise; note: Note }>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const month = date.slice(0, 7)
    ;(async () => {
      const m = await getMonth(month)
      const f = m?.fridays.find((x) => x.date === date)
      const exercise = f?.exerciseId ? await getExercise(f.exerciseId) : undefined
      const id = `fri-${date}`
      const had = (await listNotes()).find((x) => x.id === id)
      setData({ month: m, exercise, note: had ?? { id, date, month, exerciseId: f?.exerciseId, title: exercise?.title ?? f?.title, text: '', createdAt: Date.now() } })
    })().catch((e: Error) => showToast(e.message))
  }, [date])
  if (!data) return <Loading />
  const { month, exercise, note } = data
  const save = async (n: Note) => {
    setBusy(true)
    try { await saveNote(n); showToast('Am salvat nota în jurnal.'); nav('/ragaz') } catch (e) { showToast((e as Error).message); setBusy(false) }
  }
  return (
    <section className="ragaz rg-page">
      {month?.intention && <div className="rg-intent small"><span className="rg-label">Intenția lunii</span><p>{month.intention}</p></div>}
      <div className="rg-head">
        <div><span className="cs-kicker">Vineri, {dayName(date)}</span><h1>{exercise?.title ?? note.title ?? 'Seară liberă'}</h1></div>
      </div>
      {exercise ? (
        <>
          {(exercise.category || exercise.minutes) && <p className="rg-sub">{[exercise.category, exercise.minutes && `${exercise.minutes} min`].filter(Boolean).join(' · ')}</p>}
          <div className="rg-steps">{exercise.steps.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
        </>
      ) : (
        <p className="rg-sub">Nicio temă pentru seara asta. {note.title ? 'Exercițiul nu mai e în banca ta.' : <Link to="/ragaz/planifica">Alege o temă</Link>}</p>
      )}
      <h2 className="rg-label">După exercițiu</h2>
      {date > today()
        ? <p className="rg-sub">Nota o scrii vineri, după exercițiu. Până atunci poți citi tema.</p>
        : <NoteForm note={note} onSave={save} busy={busy} />}
    </section>
  )
}
