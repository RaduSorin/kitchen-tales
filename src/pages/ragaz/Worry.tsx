import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBack } from '../../lib/back'
import { showToast } from '../../lib/toast'
import { thisMonth, today, type Worry as WorryData } from '../../lib/mind/model'
import { saveNote } from '../../lib/mind/store'
import '../../ragaz.css'

type Step = 'list' | 'sort' | 'clay' | 'step' | 'parent'
const STEPS: Step[] = ['list', 'sort', 'clay', 'step', 'parent']
const NEXT: Record<Step, string> = { list: 'piatră sau plastilină', sort: 'plastilina, de la mare la mic', clay: 'un pas mic', step: 'Părintele Bun', parent: '' }
type Side = 'clay' | 'stone' | 'both'

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>

/** The note's text: the one-line summary from the program, to reread later. */
function worrySummary(w: WorryData) {
  return [
    w.clay.length && `Plastilină: ${w.clay.join('; ')}`,
    w.stone.length && `Piatră: ${w.stone.join('; ')}`,
    w.step && `Primul pas: ${w.step}`,
    w.parent?.need && `Am nevoie de: ${w.parent.need}`,
  ].filter(Boolean).join('\n')
}

/**
 * /ragaz/griji: the weekly worry list, as a guided form (no AI): write what weighs on you, sort it
 * into stone (not up to me) and clay (up to me), order the clay, pick one step of up to ten
 * minutes, then the Good Parent's three questions. It ends in the journal.
 */
export default function Worry() {
  const nav = useNavigate()
  const leave = useBack('/ragaz')
  const [at, setAt] = useState(0)
  const [text, setText] = useState('')
  const [sides, setSides] = useState<Record<string, Side>>({})
  const [clay, setClay] = useState<string[]>([])
  const [breakdown, setBreakdown] = useState(['', '', ''])
  const [step, setStep] = useState('')
  const [parent, setParent] = useState({ what: '', hardest: '', need: '' })
  const [busy, setBusy] = useState(false)

  const items = [...new Set(text.split('\n').map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean))]
  const current = STEPS[at]
  const back = () => (at > 0 ? setAt(at - 1) : leave())
  const next = () => {
    if (current === 'sort') {
      // Clay in the order it was, keeping an order already chosen.
      const want = items.filter((i) => sides[i] !== 'stone')
      setClay([...clay.filter((c) => want.includes(c)), ...want.filter((c) => !clay.includes(c))])
    }
    setAt(at + 1)
  }
  const move = (i: number, d: -1 | 1) => setClay((c) => { const x = [...c]; [x[i], x[i + d]] = [x[i + d], x[i]]; return x })
  const stone = items.filter((i) => sides[i] === 'stone' || sides[i] === 'both')
  const steps = [...breakdown.map((b) => b.trim()).filter(Boolean), ...clay]

  const save = async () => {
    const worry: WorryData = { stone, clay, breakdown: breakdown.map((b) => b.trim()).filter(Boolean), step: step.trim() || undefined, parent }
    setBusy(true)
    try {
      await saveNote({ id: crypto.randomUUID(), kind: 'worry', date: today(), month: thisMonth(), title: 'Lista de griji', worry, text: worrySummary(worry), createdAt: Date.now() })
      showToast('Am pus lista în jurnal.')
      nav('/ragaz', { replace: true })
    } catch (e) {
      showToast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className="ragaz">
      <div className="parent create-steps">
        <div className="cs-top">
          <button type="button" className="night-btn" aria-label={at > 0 ? 'Pasul anterior' : 'Înapoi'} onClick={back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="cs-dots" role="img" aria-label={`Pasul ${at + 1} din ${STEPS.length}`}>
            {STEPS.map((x, i) => <span key={x} className={i === at ? 'on' : i < at ? 'done' : undefined} />)}
          </div>
          <span />
        </div>

        {current === 'list' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Lista de griji</span>
              <h1>Ce îți stă pe creier?</h1>
              <p>Câte un lucru pe rând. Formulări scurte ajung („termenul de la serviciu”).</p>
            </div>
            <textarea className="cs-text" rows={8} aria-label="Ce te preocupă" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Termenul de la serviciu\nProgramarea la dentist\nVremea de weekend'} />
          </div>
        ) : current === 'sort' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Lista de griji</span>
              <h1>Piatră sau plastilină?</h1>
              <p><b>Plastilina</b> depinde de tine, <b>piatra</b> nu. Când nu știi: ce parte din asta poți influența?</p>
            </div>
            <div className="rg-sort">
              {items.map((i) => (
                <div className="rg-sort-row" key={i}>
                  <span>{i}</span>
                  <div className="pills" role="radiogroup" aria-label={i}>
                    {([['clay', 'Plastilină'], ['stone', 'Piatră'], ['both', 'Amândouă']] as [Side, string][]).map(([k, l]) => (
                      <button type="button" key={k} aria-pressed={(sides[i] ?? 'clay') === k} onClick={() => setSides({ ...sides, [i]: k })}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : current === 'clay' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Lista de griji</span>
              <h1>Plastilina, de la mare la mic</h1>
              <p>{clay.length ? 'Pune sus ce cere cel mai mult timp sau energie. Pe cel mai mare îl poți împărți în pași mici.' : 'Totul e piatră săptămâna asta. Uneori asta e de spus, simplu: nu depinde de mine.'}</p>
            </div>
            {clay.length > 0 && (
              <div className="rg-group">
                {clay.map((c, i) => (
                  <div className="rg-ex" key={c}>
                    <span>{i === 0 && <span className="rg-tag rg-tag-first">cel mai mare</span>}{c}</span>
                    <span className="rg-row-btns">
                      <button type="button" className="rg-ic-btn" aria-label={`Mută mai sus: ${c}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="rg-ic-btn" aria-label={`Mută mai jos: ${c}`} disabled={i === clay.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {clay.length > 0 && (
              <div className="night-field">
                <span>„{clay[0]}”, în pași mici <small>(opțional)</small></span>
                {breakdown.map((b, i) => (
                  <input key={i} value={b} aria-label={`Pasul ${i + 1}`} onChange={(e) => setBreakdown(breakdown.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Pasul ${i + 1}`} />
                ))}
              </div>
            )}
            {stone.length > 0 && (
              <div className="rg-warn">
                <b>Piatra:</b> {stone.join('; ')}. Nu depinde de tine. Un gest mic de grijă față de tine ajunge.
              </div>
            )}
          </div>
        ) : current === 'step' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Lista de griji</span>
              <h1>Un singur pas mic</h1>
              <p>Ceva ce poți face în cel mult 10 minute. Nu trebuie să-l faci acum; îl alegi doar.</p>
            </div>
            {steps.length > 0 && (
              <div className="pills rg-pills-wrap">
                {steps.map((s) => <button type="button" key={s} aria-pressed={step === s} onClick={() => setStep(step === s ? '' : s)}>{s}</button>)}
              </div>
            )}
            <label className="night-field">Sau scrie-l tu
              <input value={steps.includes(step) ? '' : step} onChange={(e) => setStep(e.target.value)} placeholder="Ex.: trimit mailul de 3 rânduri" />
            </label>
          </div>
        ) : (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Părintele Bun · 3 minute</span>
              <h1>Trei întrebări blânde</h1>
              <p>Răspunde ca un părinte bun care se uită la tine.</p>
            </div>
            <label className="night-field">Ce mă preocupă acum? (un lucru)
              <input value={parent.what} onChange={(e) => setParent({ ...parent, what: e.target.value })} />
            </label>
            <label className="night-field">Care e partea cea mai grea legată de asta?
              <input value={parent.hardest} onChange={(e) => setParent({ ...parent, hardest: e.target.value })} />
            </label>
            <label className="night-field">De ce am nevoie acum ca să mă descurc cu partea cea mai grea?
              <input value={parent.need} onChange={(e) => setParent({ ...parent, need: e.target.value })} />
            </label>
          </div>
        )}

        <div className="cs-foot">
          {current === 'parent' ? (
            <button type="button" className="moon-btn" disabled={busy} onClick={save}>{busy ? 'Se salvează…' : 'Pune în jurnal'}</button>
          ) : (
            <button type="button" className="moon-btn" disabled={current === 'list' && !items.length} onClick={next}>Mai departe <Arrow /></button>
          )}
          {NEXT[current] && <small className="cs-next">Urmează: {NEXT[current]}</small>}
        </div>
      </div>
    </section>
  )
}
