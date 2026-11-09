import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBack } from '../../lib/back'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { dayName, fridaysOf, monthName, proposeFridays, thisMonth, today, type Exercise, type Friday, type MonthPlan } from '../../lib/mind/model'
import { getMonth, listExercises, listMonths, saveMonth } from '../../lib/mind/store'
import { importPack, listPacks, type Pack } from '../../lib/mind/packs'
import { syncMonth } from '../../lib/mind/push'
import Reminders from './Reminders'
import { ImportSheet } from './Coach'
import { suggestThemes } from '../../lib/mind/coach'
import '../../ragaz.css'

type Step = 'intention' | 'success' | 'fridays' | 'reminders' | 'claude'
const STEPS: Step[] = ['intention', 'success', 'fridays']
/** The first setup ends with the reminders (card 6). */
const SETUP_STEPS: Step[] = [...STEPS, 'reminders', 'claude']
const NEXT: Record<Step, string> = { intention: 'semnul de reușită', success: 'temele de vineri', fridays: '', reminders: 'Claude (opțional)', claude: '' }
/** In the first setup these are cards 3–7 of 7 (Setup.tsx has 1–2). */
const SETUP_BEFORE = 2

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>

/** No exercises yet: import a family pack right here, or go write your own. */
function EmptyBank({ onImported }: { onImported: () => void }) {
  const [packs, setPacks] = useState<Pack[]>()
  const [busy, setBusy] = useState('')
  useEffect(() => { listPacks().then(setPacks, () => setPacks([])) }, [])
  if (!packs) return <Loading />
  return (
    <div className="rg-empty">
      <p>Banca ta de exerciții e goală. {packs.length ? 'Importă un pachet din familie' : 'Nimeni din familie n-a partajat încă un pachet'}, apoi îl poți schimba cum vrei.</p>
      {packs.map((p) => (
        <div className="rg-card" key={p.id}>
          <div><b>{p.title}</b><small>{[p.author && `de la ${p.author}`, `${p.exercises.length} exerciții`].filter(Boolean).join(' · ')}</small></div>
          <button type="button" className="btn small" disabled={!!busy}
            onClick={() => { setBusy(p.id); importPack(p).then(onImported, (e: Error) => showToast(e.message)).finally(() => setBusy('')) }}>
            {busy === p.id ? '…' : 'Importă'}
          </button>
        </div>
      ))}
      <Link to="/ragaz/exercitii" className="link-btn">Scrie exercițiile tale ›</Link>
    </div>
  )
}

/**
 * /ragaz/planifica: the month in three cards (intention, sign of success, Friday themes).
 * ?luna=2026-12 picks the month (default: this one); ?setup=1 continues the first setup.
 */
export default function Planner() {
  const [params] = useSearchParams()
  const setup = params.has('setup')
  const id = params.get('luna') ?? thisMonth()
  const nav = useNavigate()
  const leave = useBack('/ragaz')
  const [at, setAt] = useState(0)
  const [plan, setPlan] = useState<MonthPlan>()
  const [bank, setBank] = useState<Exercise[]>()
  const [busy, setBusy] = useState(false)
  const [askClaude, setAskClaude] = useState<'confirm' | 'busy'>()
  const [importing, setImporting] = useState(false)
  // Read once: a suggestion from Claude's chat to start the intention with.
  const [prefill] = useState(() => params.get('intentie')?.slice(0, 200) ?? '')

  const loadBank = () => listExercises().then((b) => { setBank(b); return b })
  useEffect(() => {
    Promise.all([getMonth(id), loadBank(), listMonths()]).then(([m, b, months]) => {
      // Fridays still ahead (this month) or all of them (a month to come).
      const dates = fridaysOf(id, id === thisMonth() ? today() : undefined)
      const used = months.filter((x) => x.id !== id).slice(0, 2).flatMap((x) => x.fridays.map((f) => f.exerciseId ?? ''))
      // A planned month opened with a suggested intention shows it, to confirm or change.
      setPlan(m ? (prefill ? { ...m, intention: prefill } : m) : { id, intention: prefill, success: '', target: Math.max(1, dates.length - 1), fridays: proposeFridays(dates, b, used), savedAt: 0 })
    }, (e: Error) => showToast(e.message))
  }, [id, prefill])

  if (!plan || !bank) return <Loading />
  const steps = setup ? SETUP_STEPS : STEPS
  const step = steps[at]
  const set = (patch: Partial<MonthPlan>) => setPlan({ ...plan, ...patch })
  const setFriday = (i: number, f: Partial<Friday>) => set({ fridays: plan.fridays.map((x, j) => (j === i ? { ...x, ...f } : x)) })
  const back = () => (at > 0 ? setAt(at - 1) : leave())
  const imported = () => loadBank().then((b) => set({ fridays: proposeFridays(plan.fridays.map((f) => f.date), b) }))

  const confirm = async () => {
    setBusy(true)
    try {
      const saved = { ...plan, intention: plan.intention.trim(), success: plan.success?.trim() }
      await saveMonth(saved)
      syncMonth(saved)
      setBusy(false)
      if (setup) { setAt(at + 1); return }
      showToast('Luna e planificată.')
      nav('/ragaz', { replace: true })
    } catch (e) {
      showToast((e as Error).message)
      setBusy(false)
    }
  }
  const propose = () => {
    if (!plan || !bank) return
    setAskClaude('busy')
    suggestThemes(plan.intention, plan.fridays.map((f) => f.date), bank.map((b) => ({ title: b.title, category: b.category })))
      .then((picks) => {
        if (!picks.length) { showToast('Claude nu a găsit potriviri. Alege tu.'); return }
        setPlan({ ...plan, fridays: plan.fridays.map((f, i) => { const x = bank.find((b) => b.title === picks[i]); return x ? { ...f, exerciseId: x.id, title: x.title } : f }) })
      }, (e: Error) => showToast(e.message))
      .finally(() => setAskClaude(undefined))
  }
  const done = () => { showToast('Gata. Ne vedem vineri.'); nav('/ragaz', { replace: true }) }

  const total = setup ? SETUP_BEFORE + steps.length : steps.length
  const pos = (setup ? SETUP_BEFORE : 0) + at
  const kicker = `Răgaz · ${monthName(id)}`
  return (
    <section className="ragaz">
      <div className="parent create-steps">
        <div className="cs-top">
          <button type="button" className="night-btn" aria-label={at > 0 ? 'Pasul anterior' : 'Înapoi'} onClick={step === 'reminders' || step === 'claude' ? done : back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="cs-dots" role="img" aria-label={`Pasul ${pos + 1} din ${total}`}>
            {Array.from({ length: total }, (_, i) => <span key={i} className={i === pos ? 'on' : i < pos ? 'done' : undefined} />)}
          </div>
          <span />
        </div>

        {step === 'intention' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Intenția lunii</h1>
              <p>O propoziție despre ce vrei să-ți dai luna asta. Stă sus pe pagina Răgaz și pe fiecare exercițiu de vineri.</p>
            </div>
            <textarea className="cs-text" rows={3} maxLength={200} aria-label="Intenția lunii" value={plan.intention}
              onChange={(e) => set({ intention: e.target.value })} placeholder="Ex.: Să am grijă de energia mea, nu doar de a celorlalți." />
          </div>
        ) : step === 'success' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Cum știi că a mers?</h1>
              <p>Un semn mic, pe care îl poți observa. Opțional.</p>
            </div>
            <label className="night-field">Semnul de reușită
              <input value={plan.success ?? ''} maxLength={160} onChange={(e) => set({ success: e.target.value })} placeholder="Ex.: Mă culc înainte de 23:00" />
            </label>
            {plan.fridays.length > 0 && (
              <div className="night-field">
                <span>Mi-ajunge dacă fac exercițiul în</span>
                <div className="pills">
                  {plan.fridays.map((_, i) => i + 1).map((n) => (
                    <button type="button" key={n} aria-pressed={plan.target === n} onClick={() => set({ target: n })}>{n} din {plan.fridays.length}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : step === 'claude' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Răgaz · Claude (opțional)</span>
              <h1>Vrei și un partener de vorbă?</h1>
              <p>Claude te poate ajuta să alegi temele sau să sortezi grijile, și poți vorbi cu el oricând. Pleacă la el doar ce trimiți tu; jurnalul nu pleacă niciodată.</p>
            </div>
            <div className="rg-card">
              <div><b>Ai deja o conversație în claude.ai?</b><small>Adu un rezumat al ei, ca să nu iei totul de la capăt. Îl vezi și îl schimbi înainte de salvare.</small></div>
              <button type="button" className="btn small" onClick={() => setImporting(true)}>Importă</button>
            </div>
            {importing && <ImportSheet stay onClose={() => setImporting(false)} />}
          </div>
        ) : step === 'reminders' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Răgaz · notificări</span>
              <h1>Să-ți amintim?</h1>
              <p>Vineri seara, tema zilei. Luni dimineața, lista de griji. Le poți schimba sau opri oricând din Profil › Răgaz.</p>
            </div>
            <Reminders compact />
          </div>
        ) : (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">{kicker}</span>
              <h1>Temele de vineri</h1>
              <p>{plan.fridays.length ? 'Câte un exercițiu pe vineri, seara. Le poți schimba oricând.' : 'Luna asta nu mai are nicio vineri. Planifică luna următoare.'}</p>
            </div>
            {bank.length > 0 && plan.fridays.length > 0 && (askClaude === 'confirm' ? (
              <div className="rg-warn">
                Pleacă la Claude intenția lunii și titlurile exercițiilor din banca ta. Nimic din jurnal.
                <div className="rg-row-btns">
                  <button type="button" className="btn small" onClick={propose}>Trimite</button>
                  <button type="button" className="btn small" onClick={() => setAskClaude(undefined)}>Renunță</button>
                </div>
              </div>
            ) : (
              <button type="button" className="link-btn" disabled={askClaude === 'busy'} onClick={() => setAskClaude('confirm')}>{askClaude === 'busy' ? 'Claude se gândește…' : 'Propune cu Claude ›'}</button>
            ))}
            {!bank.length ? <EmptyBank onImported={imported} /> : (
              <div className="rg-fridays">
                {plan.fridays.map((f, i) => (
                  <label key={f.date} className="rg-friday-pick">
                    <span>Vineri, {dayName(f.date)}</span>
                    <select value={f.exerciseId ?? ''} onChange={(e) => {
                      const x = bank.find((b) => b.id === e.target.value)
                      setFriday(i, { exerciseId: x?.id, title: x?.title ?? '' })
                    }}>
                      <option value="">Liber, fără temă</option>
                      {bank.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="cs-foot">
          {step === 'claude' ? (
            <button type="button" className="moon-btn" onClick={done}>Gata</button>
          ) : step === 'reminders' ? (
            <button type="button" className="moon-btn" onClick={() => setAt(at + 1)}>Mai departe <Arrow /></button>
          ) : step === 'fridays' ? (
            <button type="button" className="moon-btn" disabled={busy || !plan.intention.trim()} onClick={confirm}>{busy ? 'Se salvează…' : 'Confirmă luna'}</button>
          ) : (
            <button type="button" className="moon-btn" disabled={step === 'intention' && !plan.intention.trim()} onClick={() => setAt(at + 1)}>Mai departe <Arrow /></button>
          )}
          {NEXT[step] && <small className="cs-next">Urmează: {NEXT[step]}</small>}
        </div>
      </div>
    </section>
  )
}
