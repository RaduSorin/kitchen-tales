import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptRecipe, analyzeRecipe, newId, saveRecipe, setRecipeFacts } from '../lib/db'
import { allergenLabel, conflicts, dietText, EU_ALLERGENS, grams, hasDiet, parseAllergens, parseNutrition, type AllergenHit, type Nutrition } from '../lib/diet'
import { useSettings } from '../lib/settings'
import { useOnline } from '../lib/useOffline'
import { showToast } from '../lib/toast'
import type { Recipe } from '../lib/types'
import Sheet from './Sheet'

// Values worked out for a recipe of another space (we can't save them on its row): kept on this device.
const LOCAL_KEY = (r: Recipe) => `kt-facts-${r.id}-${r.updatedAt ?? ''}`
function localFacts(r: Recipe): { nutrition: Nutrition; allergens: AllergenHit[] } | undefined {
  try {
    const x = JSON.parse(localStorage.getItem(LOCAL_KEY(r)) ?? 'null')
    const nutrition = parseNutrition(JSON.stringify(x?.nutrition))
    return nutrition ? { nutrition, allergens: parseAllergens(JSON.stringify(x?.allergens)) ?? [] } : undefined
  } catch { return undefined }
}

/**
 * On a recipe: the values per serving (tap: the full card), what in it goes against the family's
 * diet with a button that writes a version that fits, and the allergens. Values and allergens are
 * estimated by AI from the ingredients the first time the recipe is opened, then kept.
 */
export default function RecipeFacts({ r, onFacts }: { r: Recipe; onFacts: (f: Pick<Recipe, 'nutrition' | 'allergens'>) => void }) {
  const { diet, kitchenTools } = useSettings()
  const online = useOnline()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [whole, setWhole] = useState(false)
  const [adapting, setAdapting] = useState(false)

  const local = !r.nutrition && r.mine === false ? localFacts(r) : undefined
  const nutrition = r.nutrition ?? local?.nutrition
  const allergens = r.allergens ?? local?.allergens

  // Not worked out yet: ask once, keep it on our own recipe (or on this device for another space's).
  useEffect(() => {
    if (nutrition || !online || !r.ingredients.length || failed) return
    let gone = false
    setBusy(true)
    analyzeRecipe(r).then(async (f) => {
      if (gone) return
      if (r.mine !== false) await setRecipeFacts(r, f).catch(() => {})
      else try { localStorage.setItem(LOCAL_KEY(r), JSON.stringify(f)) } catch { /* ignore */ }
      onFacts(f)
    }).catch(() => { if (!gone) setFailed(true) }).finally(() => { if (!gone) setBusy(false) })
    return () => { gone = true }
  }, [r.id, !!nutrition, online]) // eslint-disable-line react-hooks/exhaustive-deps

  const clashes = conflicts(allergens, diet)
  const adapt = async () => {
    setAdapting(true)
    try {
      const x = await adaptRecipe(r, dietText(diet), kitchenTools)
      const id = newId()
      const clean = (xs: (string | null)[]) => xs.filter((v): v is string => !!v)
      await saveRecipe({
        id, title: x.title, category: x.category ?? r.category, servings: x.servings ?? r.servings, minutes: x.minutes ?? r.minutes,
        ingredients: clean(x.ingredients), steps: clean(x.steps), notes: x.notes ?? undefined,
        nutrition: parseNutrition(x.nutrition), allergens: parseAllergens(x.allergens),
      }, true)
      showToast('Am făcut varianta potrivită pentru familie. Rețeta de la care ai pornit rămâne.')
      navigate(`/retete/${id}`)
    } catch { showToast('Nu am putut adapta rețeta. Încearcă din nou.') }
    setAdapting(false)
  }

  if (!nutrition) {
    if (busy) return <p className="facts-busy"><span className="spinner" aria-hidden="true" /> Calculez valorile nutriționale…</p>
    return null
  }
  const k = whole && r.servings ? r.servings : 1
  const v = (n?: number) => (n == null ? undefined : n * k)
  const total = nutrition.protein * 4 + nutrition.carbs * 4 + nutrition.fat * 9 || 1
  const share = { protein: (nutrition.protein * 4) / total, carbs: (nutrition.carbs * 4) / total, fat: (nutrition.fat * 9) / total }
  const absent = EU_ALLERGENS.filter((a) => !allergens?.some((x) => x.key === a))

  return (
    <>
      <button type="button" className="facts-strip" onClick={() => setOpen(true)} aria-label="Valori nutriționale pe porție, deschide fișa">
        <span><b>{nutrition.kcal}</b><small>kcal</small></span>
        <span><b>{grams(nutrition.protein)}</b><small>proteine</small></span>
        <span><b>{grams(nutrition.carbs)}</b><small>carbohidrați</small></span>
        <span><b>{grams(nutrition.fat)}</b><small>grăsimi</small></span>
      </button>
      <small className="facts-note">pe porție{r.servings ? `, din ${r.servings}` : ''} · atinge pentru detalii</small>

      {clashes.length > 0 && (
        <section className={`facts-clash${clashes[0].rule.strict ? ' strict' : ''}`} aria-label="Nu se potrivește cu ce mâncați">
          <div className="facts-clash-head">
            <span className="facts-clash-ic" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3zM12 10v4M12 17h.01" /></svg>
            </span>
            <div>
              <b>Conține {clashes.map((c) => allergenLabel(c.rule.key)).join(', ')}</b>
              <span>
                {clashes.map((c) => `${c.rule.strict ? 'Alergie' : 'Evitați'}${c.rule.who ? ` (${c.rule.who})` : ''}: ${allergenLabel(c.rule.key)}${c.from.length ? `, din ${c.from.join(', ')}` : ''}.`).join(' ')}
              </span>
            </div>
          </div>
          {online && <button type="button" className="moon-btn facts-adapt" disabled={adapting} onClick={adapt}>{adapting ? 'Adaptez rețeta…' : 'Adaptează rețeta'}</button>}
        </section>
      )}

      {(allergens?.length || hasDiet(diet)) ? (
        <div className="facts-allergens">
          <span className="facts-allergens-label">Alergeni:</span>
          {allergens?.length ? allergens.map((a) => (
            <span key={a.key} className={`facts-chip${clashes.some((c) => c.rule.key === a.key || c.from.some((f) => a.from.includes(f))) ? ' clash' : ''}`}>{allergenLabel(a.key)}</span>
          )) : <span className="facts-chip ok">niciunul din cei 14</span>}
          {diet.avoid.filter((d) => !clashes.some((c) => c.rule.key === d.key)).map((d) => (
            <span key={d.key} className="facts-chip ok">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              fără {allergenLabel(d.key)}
            </span>
          ))}
        </div>
      ) : null}

      {open && (
        <Sheet title="Valori nutriționale" onClose={() => setOpen(false)}>
          <div className="facts-card">
            {r.servings && r.servings > 1 ? (
              <div className="seg" role="group" aria-label="Cât arătăm">
                <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)}>O porție</button>
                <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>Toată rețeta ({r.servings})</button>
              </div>
            ) : null}
            <div className="facts-ring-row">
              <div className="facts-ring">
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <circle cx="21" cy="21" r="16" className="t" />
                  <circle cx="21" cy="21" r="16" className="p" pathLength={100} strokeDasharray={`${share.protein * 100} 100`} />
                  <circle cx="21" cy="21" r="16" className="c" pathLength={100} strokeDasharray={`${share.carbs * 100} 100`} strokeDashoffset={-share.protein * 100} />
                  <circle cx="21" cy="21" r="16" className="f" pathLength={100} strokeDasharray={`${share.fat * 100} 100`} strokeDashoffset={-(share.protein + share.carbs) * 100} />
                </svg>
                <span><b>{Math.round(nutrition.kcal * k)}</b><small>kcal</small></span>
              </div>
              <ul className="facts-macros">
                <li><i className="p" />Proteine<b>{grams(v(nutrition.protein))}</b></li>
                <li><i className="c" />Carbohidrați<b>{grams(v(nutrition.carbs))}</b></li>
                <li><i className="f" />Grăsimi<b>{grams(v(nutrition.fat))}</b></li>
              </ul>
            </div>
            <div className="facts-more">
              <span><small>Fibre</small><b>{grams(v(nutrition.fiber))}</b></span>
              <span><small>Zaharuri</small><b>{grams(v(nutrition.sugar))}</b></span>
              <span><small>Sare</small><b>{grams(v(nutrition.salt))}</b></span>
            </div>
            <h3 className="fin-label">Alergeni</h3>
            <ul className="facts-list">
              {(allergens ?? []).map((a) => (
                <li key={a.key} className={clashes.some((c) => c.rule.key === a.key) ? 'clash' : undefined}>
                  <span>{allergenLabel(a.key)}{a.from.length ? <small> {a.from.join(', ')}</small> : null}</span><b>conține</b>
                </li>
              ))}
              {absent.length > 0 && (
                <li className="none"><span>{absent.slice(0, 4).map(allergenLabel).join(', ')}{absent.length > 4 ? ` și încă ${absent.length - 4}` : ''}</span><span>nu conține</span></li>
              )}
            </ul>
            <p className="facts-disclaimer">Estimate din ingrediente. La o alergie severă, verifică și eticheta produselor.</p>
          </div>
        </Sheet>
      )}
    </>
  )
}
