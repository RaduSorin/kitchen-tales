import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listRecipes, newId, planWeek, saveRecipe, type PlannedDinner } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useSettings } from '../lib/settings'
import { useSyncedList } from '../lib/synced'
import { addDays, addPlanToShopping, atHome, dayKey, dayName, fromKey, planRecipe, planStore, shortDate, today } from '../lib/plan'
import { dietSummary, dietText, hasDiet, parseAllergens, parseNutrition } from '../lib/diet'
import { useFileUrl } from '../lib/useFileUrl'
import { formatMinutes } from '../lib/format'
import { isHeading } from '../lib/scale'
import { errorText } from '../lib/errors'
import { showToast } from '../lib/toast'
import PlatePlaceholder from '../components/PlatePlaceholder'
import MicButton from '../components/MicButton'

// "Propune cinele săptămânii" (from My week): 1) the evenings and how much time each has, 2) what
// is already at home (optional), 3) the proposal, each evening swappable, then into the week.

type Time = 'skip' | '20' | '45' | 'any'
const TIMES: [Time, string][] = [['skip', '–'], ['20', '20 min'], ['45', '45 min'], ['any', 'oricât']]
const PREFS_KEY = 'kt-plan-prefs'
const FRIDGE_KEY = 'kt-plan-fridge'
type Prefs = { times: Record<number, Time>; allowNew: boolean }
const DEFAULT_PREFS: Prefs = { times: { 0: 'skip', 1: '45', 2: '45', 3: '45', 4: '45', 5: '45', 6: 'skip' }, allowNew: true }
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)) } catch { /* ignore */ } }

const SPARK = 'M11 4l1.8 4.7L17.5 10.5l-4.7 1.8L11 17l-1.8-4.7L4.5 10.5l4.7-1.8zM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'

function Thumb({ r, title }: { r?: Recipe; title: string }) {
  const img = useFileUrl(r?.photoKey)
  return <span className="plan-thumb">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={title} />}</span>
}

export default function PlanWeek() {
  const nav = useNavigate()
  const { kitchenTools, diet } = useSettings()
  const plan = useSyncedList(planStore)
  const [recipes, setRecipes] = useState<Recipe[]>()
  useEffect(() => { listRecipes().then(setRecipes).catch(() => setRecipes([])) }, [])
  const byId = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes])

  const [step, setStep] = useState(0)
  const [prefs, setPrefs] = useState<Prefs>(() => read(PREFS_KEY, DEFAULT_PREFS))
  const [fridge, setFridge] = useState(() => { try { return localStorage.getItem(FRIDGE_KEY) ?? '' } catch { return '' } })
  const [useFridge, setUseFridge] = useState(true)
  const [items, setItems] = useState<PlannedDinner[]>()
  const [busy, setBusy] = useState(false)
  const [swapping, setSwapping] = useState<string>()
  const [error, setError] = useState('')
  const [toList, setToList] = useState(true)
  const [saving, setSaving] = useState(false)

  // The next 7 evenings (from tomorrow once it's late); evenings that already have a dish are shown, not planned.
  const start = new Date().getHours() >= 20 ? addDays(today(), 1) : today()
  const evenings = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
    const k = dayKey(d)
    const planned = plan.filter((e) => e.day === k).map((e) => byId.get(e.recipeId)?.title).filter(Boolean) as string[]
    const label = k === dayKey(today()) ? 'Azi' : k === dayKey(addDays(today(), 1)) ? 'Mâine' : dayName(d)
    return { d, k, label, planned, time: (prefs.times[d.getDay()] ?? 'skip') as Time }
  })
  const chosen = evenings.filter((e) => !e.planned.length && e.time !== 'skip')
  const setTime = (wd: number, t: Time) => { const next = { ...prefs, times: { ...prefs.times, [wd]: t } }; setPrefs(next); write(PREFS_KEY, next) }
  const setAllowNew = (v: boolean) => { const next = { ...prefs, allowNew: v }; setPrefs(next); write(PREFS_KEY, next) }

  const recent = useMemo(() => {
    const from = dayKey(addDays(today(), -14))
    return [...new Set(plan.filter((e) => e.day >= from).map((e) => byId.get(e.recipeId)?.title).filter(Boolean) as string[])]
  }, [plan, byId])
  const args = () => ({
    days: JSON.stringify(chosen.map((e) => ({ day: e.k, label: e.label, minutes: e.time === 'any' ? null : +e.time }))),
    recipes: JSON.stringify((recipes ?? []).map((r) => ({ id: r.id, title: r.title, category: r.category, minutes: r.minutes, ingredients: r.ingredients.filter((l) => !isHeading(l)).slice(0, 8) }))),
    recent,
    fridge: useFridge ? fridge.trim() : undefined,
    diet: hasDiet(diet) ? dietText(diet) : undefined,
    tools: kitchenTools,
    allowNew: prefs.allowNew,
  })

  const propose = async () => {
    setStep(2); setBusy(true); setError(''); setItems(undefined)
    if (useFridge) write(FRIDGE_KEY, fridge)
    try { setItems(await planWeek(args())) } catch (err) { setError(`Nu am putut face planul: ${errorText(err)}`) }
    setBusy(false)
  }
  const swap = async (day: string) => {
    if (!items) return
    setSwapping(day); setError('')
    try {
      const [x] = await planWeek({ ...args(), swapDay: day, keep: items.filter((i) => i.day !== day).map((i) => i.title).concat(items.find((i) => i.day === day)?.title ?? '') })
      if (x) setItems((cur) => cur?.map((i) => (i.day === day ? x : i)))
    } catch (err) { setError(`Nu am găsit altceva: ${errorText(err)}`) }
    setSwapping(undefined)
  }

  // The recipe behind each evening (a new one only as text until it is put in the week).
  const recipeOf = (x: PlannedDinner): Recipe | undefined => (x.recipeId ? byId.get(x.recipeId) : undefined)
  const skip = useFridge && fridge.trim() ? atHome(fridge) : undefined
  const listCount = useMemo(() => {
    if (!items) return 0
    const lines = new Set<string>()
    for (const x of items) {
      const ings = x.kind === 'existing' ? recipeOf(x)?.ingredients : x.kind === 'new' ? x.recipe?.ingredients?.filter((l): l is string => !!l) : undefined
      for (const l of ings ?? []) if (l.trim() && !isHeading(l) && !skip?.(l)) lines.add(l.trim().toLowerCase())
    }
    return lines.size
  }, [items, fridge, useFridge, byId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!items) return
    setSaving(true); setError('')
    try {
      const planned: { recipe: Recipe; servings?: number }[] = []
      for (const x of items) {
        if (x.kind === 'leftovers') continue
        let r = recipeOf(x)
        if (x.kind === 'new' && x.recipe) {
          const n = x.recipe
          const clean = (xs: (string | null)[]) => xs.filter((v): v is string => !!v)
          r = { id: newId(), title: n.title, category: n.category ?? '', servings: n.servings ?? undefined, minutes: n.minutes ?? undefined,
            ingredients: clean(n.ingredients), steps: clean(n.steps), notes: n.notes ?? undefined,
            nutrition: parseNutrition(n.nutrition), allergens: parseAllergens(n.allergens) }
          await saveRecipe(r, true)
        }
        if (!r) continue
        planRecipe(r, x.day)
        planned.push({ recipe: r, servings: r.servings })
      }
      const added = toList && planned.length ? addPlanToShopping(planned, skip) : 0
      showToast(`Am pus ${planned.length} ${planned.length === 1 ? 'cină' : 'cine'} în săptămână${added ? ` și ${added} ingrediente în listă` : ''}`)
      nav('/saptamana')
    } catch (err) {
      setError(`Nu am putut salva: ${errorText(err)}`)
      setSaving(false)
    }
  }

  const back = () => (step > 0 && !busy ? setStep(step - 1) : nav('/saptamana'))
  const dots = (
    <div className="cs-top">
      <button type="button" className="night-btn" aria-label={step ? 'Pasul anterior' : 'Înapoi la săptămână'} onClick={back}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div className="cs-dots" role="img" aria-label={`Pasul ${step + 1} din 3`}>
        {[0, 1, 2].map((i) => <span key={i} className={i === step ? 'on' : i < step ? 'done' : undefined} />)}
      </div>
      <span />
    </div>
  )

  return (
    <div className="parent create-steps plan-week">
      {dots}
      {step === 0 ? (
        <div className="cs-body">
          <div className="cs-q">
            <span className="cs-kicker">Planifică automat</span>
            <h1>Ce gătim săptămâna asta?</h1>
            <p>Cât timp ai pentru cină în fiecare seară. „–” înseamnă că sărim seara.</p>
          </div>
          <div className="set-box plan-days">
            {evenings.map((e) => (
              <div key={e.k} className={`plan-day${e.planned.length ? ' taken' : ''}`}>
                <span className="plan-day-name">{e.label}<small>{e.planned.length ? `deja: ${e.planned.join(', ')}` : shortDate(e.d)}</small></span>
                {!e.planned.length && (
                  <div className="seg plan-seg" role="group" aria-label={`Timp, ${e.label}`}>
                    {TIMES.map(([t, l]) => <button type="button" key={t} aria-pressed={e.time === t} onClick={() => setTime(e.d.getDay(), t)}>{l}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="seg plan-source" role="group" aria-label="De unde vin rețetele">
            <button type="button" aria-pressed={!prefs.allowNew} onClick={() => setAllowNew(false)}>Doar rețetele mele</button>
            <button type="button" aria-pressed={prefs.allowNew} onClick={() => setAllowNew(true)}>Și câteva noi</button>
          </div>
          {hasDiet(diet) && (
            <Link to="/profil/mancare" className="diet-row-link">
              <span className="diet-shield" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /></svg></span>
              <span className="diet-row-text">{dietSummary(diet)}</span>
              <span className="diet-row-change">Schimbă</span>
            </Link>
          )}
        </div>
      ) : step === 1 ? (
        <div className="cs-body">
          <div className="cs-q">
            <span className="cs-kicker">Planifică automat</span>
            <h1>Ce ai deja acasă?</h1>
            <p>Folosim întâi ce trebuie gătit, iar la listă nu mai punem ce ai. Poți sări peste.</p>
          </div>
          <MicButton value={fridge} onChange={setFridge}>
            <textarea className="cs-text" rows={5} aria-label="Ce ai acasă" value={fridge} onChange={(e) => setFridge(e.target.value)}
              placeholder="De exemplu: 2 dovlecei, piept de pui, smântână, ouă, orez" />
          </MicButton>
        </div>
      ) : (
        <div className="cs-body">
          <div className="cs-q">
            <span className="cs-kicker">Propunerea</span>
            <h1>{chosen.length === 1 ? 'O cină' : `${chosen.length} cine`}</h1>
            {!busy && items && <p>Atinge ↻ ca să schimbi doar seara aceea.</p>}
          </div>
          {busy ? (
            <p className="importing"><span className="spinner" /> Aleg cinele{prefs.allowNew ? ' și scriu rețetele noi' : ''}… durează cam o jumătate de minut.</p>
          ) : items && (
            <ul className="plan-list">
              {items.map((x) => {
                const r = recipeOf(x)
                const e = evenings.find((y) => y.k === x.day)
                const minutes = r?.minutes ?? x.recipe?.minutes ?? undefined
                return (
                  <li key={x.day} className={swapping === x.day ? 'busy' : undefined}>
                    <span className="plan-when"><small>{e?.label ?? dayName(fromKey(x.day))}</small><b>{fromKey(x.day).getDate()}</b></span>
                    {x.kind === 'leftovers' ? <span className="plan-thumb plan-leftovers" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11h16a8 8 0 0 1-16 0zM8 7c0-1 1-1.5 1-2.5M12 7c0-1 1-1.5 1-2.5M16 7c0-1 1-1.5 1-2.5" /></svg></span> : <Thumb r={r} title={x.title} />}
                    <span className="plan-text">
                      <b>{x.title}</b>
                      <small>{[minutes ? formatMinutes(minutes) : '', x.reason].filter(Boolean).join(' · ')}</small>
                      {x.kind === 'new' && <span className="plan-new">rețetă nouă</span>}
                    </span>
                    <button type="button" className="plan-swap" aria-label={`Altceva pentru ${e?.label ?? x.day}`} disabled={!!swapping} onClick={() => swap(x.day)}>
                      {swapping === x.day ? <span className="spinner" aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" /></svg>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="cs-foot">
        {step === 0 ? (
          <button type="button" className="moon-btn" disabled={!chosen.length || !recipes} onClick={() => setStep(1)}>
            {chosen.length ? `Mai departe · ${chosen.length} ${chosen.length === 1 ? 'seară' : 'seri'}` : 'Alege cel puțin o seară'}
          </button>
        ) : step === 1 ? (
          <>
            <button type="button" className="moon-btn" onClick={() => { setUseFridge(true); propose() }} disabled={!fridge.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SPARK} /></svg>
              Propune cinele
            </button>
            <button type="button" className="link-btn cs-own" onClick={() => { setUseFridge(false); propose() }}>Sari peste ›</button>
          </>
        ) : items && !busy ? (
          <>
            {listCount > 0 && (
              <label className="plan-tolist">
                <input type="checkbox" checked={toList} onChange={(e) => setToList(e.target.checked)} />
                <span>Pune și ingredientele în listă <small>({listCount}{skip ? ', fără ce ai acasă' : ''})</small></span>
              </label>
            )}
            <button type="button" className="moon-btn" disabled={saving || !items.length} onClick={save}>{saving ? 'Se salvează…' : 'Pune în săptămână'}</button>
          </>
        ) : error ? (
          <button type="button" className="moon-btn" onClick={propose}>Încearcă din nou</button>
        ) : null}
      </div>
    </div>
  )
}
