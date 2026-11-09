import { useEffect, useState } from 'react'
import Sheet from '../../components/Sheet'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { dayName, monthName, thisMonth, today, type Note } from '../../lib/mind/model'
import { listNotes, removeNote, saveNote } from '../../lib/mind/store'
import { NoteForm } from './Friday'
import '../../ragaz.css'

const FIT = { da: 's-a potrivit', partial: 'parțial', nu: 'nu prea' }

/** /ragaz/jurnal: every note, newest first, by month. */
export default function Journal() {
  const [notes, setNotes] = useState<Note[]>()
  const [open, setOpen] = useState<Note>()
  const [confirmDel, setConfirmDel] = useState(false)
  const load = () => listNotes().then(setNotes, (e: Error) => showToast(e.message))
  useEffect(() => { load() }, [])
  if (!notes) return <Loading />

  const months = [...new Set(notes.map((n) => n.month))]
  const write = () => setOpen({ id: crypto.randomUUID(), kind: 'free', date: today(), month: thisMonth(), text: '', createdAt: Date.now() })
  const close = () => { setOpen(undefined); setConfirmDel(false) }
  return (
    <section className="ragaz rg-page">
      <div className="rg-head">
        <div><span className="cs-kicker">Răgaz</span><h1>Jurnal</h1></div>
        <button type="button" className="moon-btn rg-small" onClick={write}>Scrie</button>
      </div>
      {!notes.length && <p className="rg-sub">Nimic încă. După fiecare exercițiu de vineri, nota ta apare aici. Poți scrie și oricând altceva.</p>}
      {months.map((m) => (
        <div className="rg-sec" key={m}>
          <h2 className="rg-label">{monthName(m)} {m.slice(0, 4)}</h2>
          {notes.filter((n) => n.month === m).map((n) => (
            <button type="button" className="rg-entry" key={n.id} onClick={() => setOpen(n)}>
              <small>{dayName(n.date)}{n.title ? ` · ${n.title}` : ''}</small>
              {(n.before !== undefined || n.after !== undefined || n.fit) && (
                <span className="rg-entry-line">{[n.before !== undefined && n.after !== undefined ? `${n.before} → ${n.after}` : String(n.before ?? n.after ?? ''), n.fit ? FIT[n.fit] : ''].filter(Boolean).join(' · ')}</span>
              )}
              {n.text && <p>{n.text}</p>}
            </button>
          ))}
        </div>
      ))}
      {open && (
        <Sheet title={open.title ?? dayName(open.date)} onClose={close}>
          <div className="settings ragaz rg-form">
            {open.kind === 'worry' || open.kind === 'reflection'
              ? <div className="rg-steps"><p>{open.text}</p></div>
              : <NoteForm note={open} scales={open.id.startsWith('fri-') || open.before !== undefined || open.after !== undefined} onSave={(n) => saveNote(n).then(() => { close(); load() }, (e: Error) => showToast(e.message))} />}
            {notes.some((n) => n.id === open.id) && (confirmDel ? (
              <span className="confirm">Ștergi nota?
                <button type="button" className="btn danger small" onClick={() => removeNote(open.id).then(() => { close(); load() })}>Da, șterge</button>
                <button type="button" className="btn small" onClick={() => setConfirmDel(false)}>Nu</button>
              </span>
            ) : <button type="button" className="btn danger small" onClick={() => setConfirmDel(true)}>Șterge nota</button>)}
          </div>
        </Sheet>
      )}
    </section>
  )
}
