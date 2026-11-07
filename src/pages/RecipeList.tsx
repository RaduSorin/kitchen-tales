import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes } from '../lib/db'
import type { Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import PlatePlaceholder from '../components/PlatePlaceholder'
import ShareIcon from '../components/ShareIcon'
import PopMenu, { MenuRow, MENU_ICON } from '../components/PopMenu'
import { formatMinutes, matchesQuery } from '../lib/format'
import { LoadError, Loading } from '../components/LoadState'
import { useSyncedList } from '../lib/synced'
import { addDays, addToShopping, dayKey, dayName, fromKey, planStore, today } from '../lib/plan'
import { showToast } from '../lib/toast'
import { DayPicker } from './RecipeView'

export function RecipeRow({ r }: { r: Recipe }) {
  const img = useFileUrl(r.photoKey)
  const meta = [r.mine === false && `De la ${r.spaceName ?? 'alt cont'}`, r.category, r.minutes && formatMinutes(r.minutes), r.servings && `${r.servings} porții`].filter(Boolean).join(' · ')
  return (
    <Link to={`/retete/${r.id}`} className="recipe-row">
      <div className="recipe-thumb">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}</div>
      <div className="recipe-row-text">
        <span className="recipe-row-title">{r.title}{r.mine && r.shared && <span className="shared-mark" title="Partajată cu toate conturile" aria-label="Partajată cu toate conturile"> <ShareIcon shared size={14} /></span>}</span>
        {meta && <small>{meta}</small>}
      </div>
    </Link>
  )
}

// ---- views: list (as before), a grid of big photos, magazine cards, rows per category ----

type View = 'list' | 'grid' | 'magazine' | 'rows'
type Sort = 'az' | 'new' | 'fast' | 'cooked'
const VIEWS: { v: View; label: string; icon: string }[] = [
  { v: 'list', label: 'Listă', icon: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' },
  { v: 'grid', label: 'Grilă', icon: 'M4 4h7v9H4zM13 4h7v6h-7zM4 15h7v5H4zM13 12h7v8h-7z' },
  { v: 'magazine', label: 'Revistă', icon: 'M4 4h16v10H4zM4 18h16M4 21h10' },
  { v: 'rows', label: 'Categorii', icon: 'M3 4h6v6H3zM11 4h6v6h-6zM3 14h6v6H3zM11 14h6v6h-6zM20 4v6M20 14v6' },
]
const SORTS: { s: Sort; label: string }[] = [
  { s: 'az', label: 'Alfabetic' }, { s: 'new', label: 'Cele mai noi' }, { s: 'fast', label: 'Cele mai rapide' }, { s: 'cooked', label: 'Gătite des' },
]
const VIEW_KEY = 'kt-recipes-view'
const SORT_KEY = 'kt-recipes-sort'
const readKey = <T extends string>(k: string, ok: readonly T[], fallback: T): T => {
  try { const v = localStorage.getItem(k) as T | null; return v && ok.includes(v) ? v : fallback } catch { return fallback }
}
const writeKey = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
// A drawn plus, so it sits exactly in the middle of its round button (a typed "+" sits low).
const PLUS = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
const CAL = 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4'
const CART = 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20.5h.01M17 20.5h.01'

/** Grid: a photo card with the title over it; the height varies a little, like a board of photos. */
function Tile({ r, h }: { r: Recipe; h: number }) {
  const img = useFileUrl(r.photoKey)
  const meta = [r.minutes && formatMinutes(r.minutes), r.servings && `${r.servings} porții`].filter(Boolean).join(' · ')
  return (
    <Link to={`/retete/${r.id}`} className="rtile" style={{ height: h }}>
      {img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}
      <span className="rtile-text"><b>{r.title}</b>{meta && <small>{meta}</small>}</span>
    </Link>
  )
}

/** Magazine: a big photo with the category on it, the title in Fraunces, and plan / shop buttons. */
function Card({ r, onPlan }: { r: Recipe; onPlan: () => void }) {
  const img = useFileUrl(r.photoKey)
  const meta = [r.minutes && formatMinutes(r.minutes), r.servings && `${r.servings} porții`, r.nutrition && `${r.nutrition.kcal} kcal`].filter(Boolean).join(' · ')
  return (
    <article className="rcard">
      <Link to={`/retete/${r.id}`} className="rcard-photo" aria-label={r.title}>
        {img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}
        {r.category && <span className="rcard-cat">{r.category}</span>}
      </Link>
      <div className="rcard-foot">
        <Link to={`/retete/${r.id}`} className="rcard-text"><b>{r.title}</b>{meta && <small>{meta}</small>}</Link>
        <div className="rcard-btns">
          <button type="button" aria-label={`Pune ${r.title} în săptămână`} onClick={onPlan}><Icon d={CAL} size={18} /></button>
          {r.ingredients.length > 0 && (
            <button type="button" aria-label={`Pune ingredientele pentru ${r.title} în listă`} onClick={() => {
              const n = addToShopping(r, r.servings)
              showToast(n ? `Am pus ${n} ${n === 1 ? 'ingredient' : 'ingrediente'} în listă` : 'Sunt deja în listă')
            }}><Icon d={CART} size={18} /></button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Rows: a square photo with the title under it, in a row you scroll sideways. */
function Square({ r, note }: { r: Recipe; note?: string }) {
  const img = useFileUrl(r.photoKey)
  return (
    <Link to={`/retete/${r.id}`} className="rsq">
      <span className="rsq-photo">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}</span>
      <b>{r.title}</b>
      <small>{note ?? (r.minutes ? formatMinutes(r.minutes) : '')}</small>
    </Link>
  )
}

/** Two columns, filled left-right in order; heights vary by recipe so it looks like a board. */
function Grid({ items }: { items: Recipe[] }) {
  const height = (r: Recipe) => [200, 170, 230][[...r.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 3]
  const cols: Recipe[][] = [[], []]
  const tall = [0, 0]
  for (const r of items) { const c = tall[0] <= tall[1] ? 0 : 1; cols[c].push(r); tall[c] += height(r) }
  return (
    <div className="rgrid">
      {cols.map((col, i) => <div key={i} className="rgrid-col">{col.map((r) => <Tile key={r.id} r={r} h={height(r)} />)}</div>)}
    </div>
  )
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [q, setQ] = useState('')
  // Opened from a category card on Acasă (?cat=Deserturi): that category already picked.
  const [cat, setCat] = useState(() => new URLSearchParams(window.location.search).get('cat') ?? '')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [view, setViewState] = useState<View>(() => readKey(VIEW_KEY, VIEWS.map((x) => x.v), 'grid'))
  const [sort, setSortState] = useState<Sort>(() => readKey(SORT_KEY, SORTS.map((x) => x.s), 'az'))
  const [menu, setMenu] = useState(false)
  const [planning, setPlanning] = useState<Recipe>()
  const closeMenu = useCallback(() => setMenu(false), [])
  const setView = (v: View) => { setViewState(v); writeKey(VIEW_KEY, v); setCat('') }
  const setSort = (s: Sort) => { setSortState(s); writeKey(SORT_KEY, s) }
  const plan = useSyncedList(planStore)
  const load = () => {
    listRecipes().then(setRecipes).catch(() => setFailed(true)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const cats = useMemo(() => [...new Set(recipes.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), [recipes])
  // How often each recipe was planned (the week plan is the family's cooking diary).
  const cooked = useMemo(() => { const m = new Map<string, number>(); for (const e of plan) m.set(e.recipeId, (m.get(e.recipeId) ?? 0) + 1); return m }, [plan])
  const order = (a: Recipe, b: Recipe) => {
    const byTitle = a.title.localeCompare(b.title, 'ro')
    if (sort === 'new') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || byTitle
    if (sort === 'fast') return (a.minutes ?? 9999) - (b.minutes ?? 9999) || byTitle
    if (sort === 'cooked') return (cooked.get(b.id) ?? 0) - (cooked.get(a.id) ?? 0) || byTitle
    return byTitle
  }
  const matching = recipes.filter((r) => !q || matchesQuery([r.title, r.category, ...r.ingredients].join(' '), q)).sort(order)
  const shown = matching.filter((r) => !cat || r.category === cat)

  // Rows view: this week's plan first, then one row per category (searching or a category picked: a grid).
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])
  const week = useMemo(() => {
    const from = dayKey(today()), to = dayKey(addDays(today(), 6))
    return plan.filter((e) => e.day >= from && e.day <= to && byId.has(e.recipeId)).sort((a, b) => a.day.localeCompare(b.day))
      .map((e) => ({ r: byId.get(e.recipeId)!, note: e.day === from ? 'azi' : dayName(fromKey(e.day)).toLowerCase(), key: e.id }))
  }, [plan, byId])
  const rowsMode = view === 'rows' && !q && !cat
  const current = VIEWS.find((x) => x.v === view)!

  return (
    <section className={`recipes recipes-${view}`}>
      <div className="recipes-head">
        <h1>Rețetele mele</h1>
        <div className="recipes-head-btns">
          <span className="menu-anchor">
            <button type="button" className="recipes-view-btn" aria-haspopup="menu" aria-expanded={menu} aria-label={`Vizualizare: ${current.label}. Schimbă vizualizarea sau ordinea`}
              onClick={() => setMenu((m) => !m)}>
              <Icon d={current.icon} />
            </button>
            {menu && (
              <PopMenu label="Vizualizare și ordine" onClose={closeMenu}>
                <small className="folder-menu-label">Vizualizare</small>
                <div className="folder-menu-views">
                  {VIEWS.map((x) => (
                    <button type="button" key={x.v} role="menuitemradio" aria-checked={x.v === view} className={x.v === view ? 'on' : undefined}
                      onClick={() => { setView(x.v); closeMenu() }}>
                      <Icon d={x.icon} /><span>{x.label}</span>
                    </button>
                  ))}
                </div>
                <small className="folder-menu-label">Ordine</small>
                {SORTS.map((x) => (
                  <MenuRow key={x.s} icon={x.s === sort ? MENU_ICON.check : undefined} onClick={() => { setSort(x.s); closeMenu() }}>{x.label}</MenuRow>
                ))}
              </PopMenu>
            )}
          </span>
          <Link to="/retete/noua" className="btn primary new-recipe" aria-label="Rețetă nouă" title="Rețetă nouă">{PLUS}<span className="new-recipe-text" aria-hidden="true">Rețetă nouă</span></Link>
        </div>
      </div>
      <label className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input type="search" id="recipe-search" aria-label="Caută rețete" placeholder="Caută după nume sau ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {cats.length > 0 && view !== 'rows' && (
        <div className="cat-tabs" role="group" aria-label="Categorii">
          <button type="button" aria-pressed={!cat} onClick={() => setCat('')}>Toate</button>
          {cats.map((c) => (
            <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}
      {view === 'rows' && cat && (
        <button type="button" className="rows-back" onClick={() => setCat('')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Toate categoriile
        </button>
      )}
      {loading ? <Loading /> : failed ? <LoadError text="Nu am putut încărca rețetele. Verifică internetul." onRetry={() => { setLoading(true); setFailed(false); load() }} /> : recipes.length === 0 ? (
        <p className="empty">Nicio rețetă încă. Adaugă prima ta rețetă!</p>
      ) : shown.length === 0 ? (
        <p className="empty">Nicio rețetă nu se potrivește cu „{q}”.</p>
      ) : rowsMode ? (
        <div className="rrows">
          {week.length > 0 && (
            <section className="rrow">
              <div className="rrow-head"><h2>Săptămâna asta</h2><Link to="/saptamana">{week.length} {week.length === 1 ? 'planificată' : 'planificate'} ›</Link></div>
              <div className="rrow-scroll">{week.map((w) => <Square key={w.key} r={w.r} note={w.note} />)}</div>
            </section>
          )}
          {[...cats, ''].map((c) => {
            const xs = matching.filter((r) => (r.category || '') === c)
            if (!xs.length) return null
            return (
              <section className="rrow" key={c || '_'}>
                <div className="rrow-head">
                  <h2>{c || 'Fără categorie'}</h2>
                  {c ? <button type="button" onClick={() => setCat(c)}>{xs.length} {xs.length === 1 ? 'rețetă' : 'rețete'} ›</button> : null}
                </div>
                <div className="rrow-scroll">{xs.map((r) => <Square key={r.id} r={r} />)}</div>
              </section>
            )
          })}
        </div>
      ) : view === 'list' ? (
        <div className="recipe-rows">{shown.map((r) => <RecipeRow key={r.id} r={r} />)}</div>
      ) : view === 'magazine' ? (
        <div className="rcards">{shown.map((r) => <Card key={r.id} r={r} onPlan={() => setPlanning(r)} />)}</div>
      ) : (
        <Grid items={shown} />
      )}
      {/* Phones: "+" floats at the bottom right, above the tab bar, always within the thumb's reach. */}
      <Link to="/retete/noua" className="fab-new" aria-label="Rețetă nouă" title="Rețetă nouă">{PLUS}</Link>
      {planning && <DayPicker r={planning} servings={planning.servings} onClose={() => setPlanning(undefined)} onDone={(msg) => { setPlanning(undefined); showToast(msg) }} />}
    </section>
  )
}
