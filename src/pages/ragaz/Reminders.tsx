import { useEffect, useState } from 'react'
import { showToast } from '../../lib/toast'
import { getLocal } from '../../lib/mind/vault'
import { listMonths } from '../../lib/mind/store'
import { thisMonth } from '../../lib/mind/model'
import { DEFAULT_RHYTHMS, enableReminders, pushProblem, saveRhythms, sendTest, syncMonth, type Rhythms } from '../../lib/mind/push'

const PROBLEM = {
  install: 'Pe iPhone, notificările merg doar din aplicația de pe ecranul principal (Distribuie › Adaugă pe ecranul principal).',
  browser: 'Browserul acesta nu poate primi notificări.',
  denied: 'Notificările sunt oprite pentru aplicație. Le pornești din Setări › Notificări › Bucătăria.',
}

/**
 * The reminders: Friday's theme and Monday morning (worry list, or the monthly reflection). Used in the
 * setup's last card and in Profile › Răgaz.
 */
export default function Reminders({ compact }: { compact?: boolean }) {
  const [on, setOn] = useState<Rhythms>()
  const [draft, setDraft] = useState<Rhythms>(DEFAULT_RHYTHMS)
  const [busy, setBusy] = useState('')
  const problem = pushProblem()
  useEffect(() => { getLocal().then((l) => { setOn(l.reminders); if (l.reminders) setDraft(l.reminders) }).catch(() => {}) }, [])

  const enable = () => {
    setBusy('on')
    // Straight from the tap: iOS asks for permission only then.
    enableReminders(draft)
      .then(async (ok) => {
        if (!ok) { showToast(pushProblem() === 'denied' ? PROBLEM.denied : 'Notificările nu sunt permise.'); return }
        // The months already planned, so Friday's reminder names its theme.
        const months = (await listMonths()).filter((m) => m.id >= thisMonth())
        for (const m of months) await syncMonth(m)
        setOn(draft)
        showToast('Notificările sunt pornite.')
      }, (e: Error) => showToast(e.message))
      .finally(() => setBusy(''))
  }
  const change = (r: Rhythms) => {
    setDraft(r)
    if (!on) return
    setBusy('save')
    saveRhythms(r).then(() => setOn(r), (e: Error) => showToast(e.message)).finally(() => setBusy(''))
  }
  const test = () => {
    setBusy('test')
    sendTest().then((r) => showToast(r.sent ? 'Am trimis. Ar trebui să apară în câteva secunde.' : 'Nu am găsit niciun telefon cu notificările pornite.'), (e: Error) => showToast(e.message)).finally(() => setBusy(''))
  }

  const fri = draft.friday
  const mon = draft.monday
  return (
    <div className={compact ? 'rg-reminders' : 'set-group'}>
      <div className={compact ? 'rg-group' : 'set-box'}>
        <label className="set-row">
          <span>Tema de vineri<small className="set-sub">Titlul temei apare pe ecranul blocat. Niciodată ce scrii tu.</small></span>
          <input type="checkbox" className="switch" checked={fri.on} disabled={!!busy} onChange={(e) => change({ ...draft, friday: { ...fri, on: e.target.checked } })} />
        </label>
        {fri.on && (
          <label className="set-row">
            <span>Ora</span>
            <input type="time" className="rg-time" value={fri.time} disabled={!!busy} onChange={(e) => e.target.value && change({ ...draft, friday: { ...fri, time: e.target.value } })} />
          </label>
        )}
        <label className="set-row">
          <span>Luni dimineața<small className="set-sub">Lista de griji; în prima luni din lună, reflecția lunii</small></span>
          <input type="checkbox" className="switch" checked={mon.on} disabled={!!busy} onChange={(e) => change({ ...draft, monday: { ...mon, on: e.target.checked } })} />
        </label>
        {mon.on && (
          <label className="set-row">
            <span>Ora</span>
            <input type="time" className="rg-time" value={mon.time} disabled={!!busy} onChange={(e) => e.target.value && change({ ...draft, monday: { ...mon, time: e.target.value } })} />
          </label>
        )}
        {!compact && on && (
          <div className="set-row">
            <span>Încearcă acum<small className="set-sub">Trimite o notificare de test pe telefoanele tale</small></span>
            <button type="button" className="btn small" disabled={!!busy} onClick={test}>{busy === 'test' ? '…' : 'Trimite'}</button>
          </div>
        )}
      </div>
      {problem ? <p className="set-hint">{PROBLEM[problem]}</p> : !on && (
        <button type="button" className={compact ? 'btn rg-wide' : 'btn primary'} disabled={!!busy || (!fri.on && !mon.on)} onClick={enable}>{busy === 'on' ? 'Se pornesc…' : 'Pornește notificările pe acest telefon'}</button>
      )}
      {on && <p className="set-hint">Pornite pe acest telefon. Pe un telefon nou le pornești din nou de aici.</p>}
    </div>
  )
}
