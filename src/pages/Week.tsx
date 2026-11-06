import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { listRecipes } from '../lib/db'
import type { PlanEntry, Recipe } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { matchesQuery } from '../lib/format'
import { useSyncedList } from '../lib/synced'
import { useGlow } from '../lib/glow'
import { addDays, addPlanToShopping, dayKey, dayName, planRecipe, planStore, shortDate, today } from '../lib/plan'
import PlatePlaceholder from '../components/PlatePlaceholder'
import Sheet from '../components/Sheet'
import PopMenu, { MenuRow, MENU_ICON } from '../components/PopMenu'
import { showToast } from '../lib/toast'
import '../week.css'

// "Săptămâna mea" as day columns (concept 1): the days run on without week breaks, you swipe
// sideways from day to day, and each day's column scrolls up and down on its own.

/** Days shown before today and after it when the page opens (more are added as you swipe on). */
const BEFORE = 56
const AFTER = 182
const MORE = 56

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
const monthLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

const ICON = {
  cart: 'M3 4h2l2.4 10.2a1.5 1.5 0 0 0 1.5 1.1h7.9a1.5 1.5 0 0 0 1.4-1.1L20 8H6.2M9.5 20h.01M17 20h.01',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  open: 'M7 17 17 7M9 7h8v8',
  move: 'M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3',
}

const Chevron = ({ dir }: { dir: 'left' | 'right' | 'down' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : dir === 'right' ? 'M9 5l7 7-7 7' : 'M6 9l6 6 6-6'} />
  </svg>
)

function Thumb({ r }: { r?: Recipe }) {
  const img = useFileUrl(r?.photoKey)
  return img ? <img src={img} alt="" loading="lazy" /> : <PlatePlaceholder seed={r?.title ?? ''} />
}

const servingsOf = (e: PlanEntry, r?: Recipe) => e.servings ?? r?.servings ?? 4

/**
 * The card's ⋯ menu. The columns clip what overflows them, so the menu sits on the page, pinned
 * to the button (opening upwards near the bottom of the screen), and closes when anything scrolls.
 */
function CardMenu({ at, e, r, onClose, onMove }: { at: DOMRect; e: PlanEntry; r?: Recipe; onClose: () => void; onMove: () => void }) {
  const navigate = useNavigate()
  useEffect(() => {
    const close = () => onClose()
    document.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('scroll', close, { capture: true }); window.removeEventListener('resize', close) }
  }, [onClose])
  const up = at.bottom > window.innerHeight - 300
  const n = servingsOf(e, r)
  const setServings = (v: number) => planStore.update({ ...e, servings: Math.max(1, Math.min(40, v)) })
  const title = r?.title ?? 'rețeta'
  return createPortal(
    <div className={`wk-menu-pin${up ? ' up' : ''}`} style={{ top: up ? at.top : at.bottom, left: Math.max(at.right, Math.min(272, window.innerWidth - 32) + 16) }}>
      <PopMenu label={`Opțiuni pentru ${title}`} onClose={onClose}>
        {r && <MenuRow icon={ICON.open} onClick={() => { onClose(); navigate(`/retete/${r.id}`) }}>Deschide rețeta</MenuRow>}
        <div className="wk-servings">
          <span>Porții</span>
          <div>
            <button type="button" onClick={() => setServings(n - 1)} disabled={n <= 1} aria-label="O porție mai puțin">−</button>
            <b aria-live="polite">{n}</b>
            <button type="button" onClick={() => setServings(n + 1)} aria-label="O porție mai mult">+</button>
          </div>
        </div>
        <MenuRow icon={ICON.move} onClick={() => { onClose(); onMove() }}>Mută în altă zi</MenuRow>
        <MenuRow icon={MENU_ICON.trash} danger onClick={() => { onClose(); planStore.remove(e.id); showToast(`Am scos ${title}`, () => planStore.create(e)) }}>Scoate din ziua asta</MenuRow>
      </PopMenu>
    </div>,
    document.body,
  )
}

function Card({ e, r, loaded, menuOpen, onMenu }: { e: PlanEntry; r?: Recipe; loaded: boolean; menuOpen: boolean; onMenu: (at?: DOMRect) => void }) {
  const title = r?.title ?? (loaded ? 'Rețeta nu mai e disponibilă' : '…')
  const photo = <span className="wk-photo"><Thumb r={r} /></span>
  return (
    <li className="wk-card">
      {r ? <Link to={`/retete/${r.id}`} className="wk-card-link" aria-label={title}>{photo}</Link> : <span className="wk-card-link">{photo}</span>}
      <div className="wk-card-foot">
        <span className="wk-card-title">
          {title}
          {e.servings && e.servings !== r?.servings ? <small>{e.servings} porții</small> : null}
        </span>
        <span className="menu-anchor">
          <button type="button" className="wk-more" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Opțiuni pentru ${title}`}
            onClick={(ev) => onMenu(menuOpen ? undefined : ev.currentTarget.getBoundingClientRect())}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        </span>
      </div>
    </li>
  )
}

function RecipePicker({ day, recipes, onClose }: { day: Date; recipes: Recipe[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const shown = recipes.filter((r) => matchesQuery([r.title, r.category, ...r.ingredients].join(' '), q))
    .sort((a, b) => a.title.localeCompare(b.title, 'ro'))
  return (
    <Sheet title={`${dayName(day)}, ${shortDate(day)}`} onClose={onClose}>
      <label className="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input type="search" aria-label="Caută rețete" placeholder="Caută o rețetă" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {recipes.length === 0 ? (
        <p className="empty">Nicio rețetă încă. <Link to="/retete/noua">Adaugă una</Link></p>
      ) : (
        <ul className="pick-list">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { planRecipe(r, dayKey(day)); onClose() }}>
                <span className="planned-thumb"><Thumb r={r} /></span>
                <span>{r.title}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="empty">Nicio rețetă nu se potrivește.</li>}
        </ul>
      )}
    </Sheet>
  )
}

/** "Mută în altă zi": yesterday, today and the next two weeks. */
function MoveSheet({ e, r, onClose }: { e: PlanEntry; r?: Recipe; onClose: () => void }) {
  const t = today()
  const days = Array.from({ length: 16 }, (_, i) => addDays(t, i - 1))
  return (
    <Sheet title="Mută în altă zi" onClose={onClose}>
      <ul className="pick-list day-pick">
        {days.map((d, i) => {
          const k = dayKey(d)
          const label = i === 0 ? 'Ieri' : i === 1 ? 'Azi' : i === 2 ? 'Mâine' : dayName(d)
          return (
            <li key={k}>
              <button type="button" disabled={k === e.day} onClick={() => {
                planStore.update({ ...e, day: k })
                showToast(`Am mutat ${r?.title ?? 'rețeta'} ${i === 1 ? 'azi' : i === 2 ? 'mâine' : `${label.toLowerCase()}, ${shortDate(d)}`}`, () => planStore.update(e))
                onClose()
              }}>
                <span><b>{label}</b> <small>{shortDate(d)}</small></span>
                {k === e.day && <small className="day-pick-on">acum</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/** The month under the title: tap a day to jump to it; dots mark days with recipes. */
function MonthSheet({ month, planned, onPick, onClose }: { month: Date; planned: Set<string>; onPick: (d: Date) => void; onClose: () => void }) {
  const [m, setM] = useState(() => new Date(month.getFullYear(), month.getMonth(), 1))
  const first = addDays(m, -((m.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const rows = cells[35].getMonth() === m.getMonth() ? 6 : 5
  const todayKey = dayKey(today())
  return (
    <Sheet title="Sari la o zi" onClose={onClose}>
      <div className="wk-cal-head">
        <button type="button" className="week-arrow" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Luna trecută"><Chevron dir="left" /></button>
        <b>{monthLabel(m)}</b>
        <button type="button" className="week-arrow" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Luna viitoare"><Chevron dir="right" /></button>
      </div>
      <div className="wk-cal" role="grid">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <span key={i} className="wk-cal-dow" aria-hidden="true">{x}</span>)}
        {cells.slice(0, rows * 7).map((d) => {
          const k = dayKey(d)
          const cls = ['wk-cal-day', d.getMonth() !== m.getMonth() && 'out', k === todayKey && 'today', planned.has(k) && 'has'].filter(Boolean).join(' ')
          return (
            <button key={k} type="button" className={cls} onClick={() => onPick(d)} aria-label={`${dayName(d)}, ${shortDate(d)}${planned.has(k) ? ', are rețete' : ''}`}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
      <button type="button" className="btn" onClick={() => onPick(today())}>Azi</button>
    </Sheet>
  )
}

export default function Week() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loaded, setLoaded] = useState(false)
  const plan = useSyncedList(planStore)
  useEffect(() => { listRecipes().then((xs) => { setRecipes(xs); setLoaded(true) }).catch(() => {}) }, [])
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])

  const t = today()
  const todayKey = dayKey(t)
  const [range, setRange] = useState(() => ({ start: addDays(t, -BEFORE), count: BEFORE + AFTER }))
  const days = useMemo(() => Array.from({ length: range.count }, (_, i) => addDays(range.start, i)), [range])
  const byDay = useMemo(() => {
    const m = new Map<string, PlanEntry[]>()
    for (const e of plan) m.set(e.day, [...(m.get(e.day) ?? []), e])
    return m
  }, [plan])

  const [picking, setPicking] = useState<Date>()
  const [menu, setMenu] = useState<{ id: string; at: DOMRect }>()
  const [moving, setMoving] = useState<PlanEntry>()
  const [calendar, setCalendar] = useState(false)
  const [shopMenu, setShopMenu] = useState(false)
  const closeMenu = useCallback(() => setMenu(undefined), [])
  const closeShop = useCallback(() => setShopMenu(false), [])

  // The dish of the day lights the background, like the other recipe screens.
  const glowRecipe = (byDay.get(todayKey) ?? []).map((e) => byId.get(e.recipeId)).find((r) => r?.photoKey)
  useGlow(glowRecipe && { id: glowRecipe.id, title: glowRecipe.title, photoKey: glowRecipe.photoKey })

  // ---- the board fills the screen below the title; only the columns scroll ----
  const board = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.weekBoard = ''
    const el = board.current
    const fit = () => { if (el) el.style.height = `${Math.max(260, window.innerHeight - el.getBoundingClientRect().top - window.scrollY)}px` }
    fit()
    window.addEventListener('resize', fit)
    const ro = new ResizeObserver(fit)
    ro.observe(document.body)
    return () => { delete root.dataset.weekBoard; window.removeEventListener('resize', fit); ro.disconnect() }
  }, [])

  const pendingJump = useRef<Date | undefined>(addDays(t, -1))
  const colWidth = () => board.current?.querySelector<HTMLElement>('.wk-col')?.offsetWidth || 150
  /** Brings a day to the left edge (as the first of the three columns on screen). */
  const scrollToDay = useCallback((d: Date, smooth = true) => {
    const el = board.current
    if (!el) return
    const i = daysBetween(range.start, d)
    if (i < 0 || i >= range.count - 3) {
      // Far away: start the strip around that day instead.
      setRange({ start: addDays(d, -BEFORE), count: BEFORE + AFTER })
      pendingJump.current = d
      return
    }
    el.scrollTo({ left: i * colWidth(), behavior: smooth ? 'smooth' : 'auto' })
  }, [range])
  useLayoutEffect(() => {
    const d = pendingJump.current
    if (!d || !board.current) return
    pendingJump.current = undefined
    board.current.scrollLeft = Math.max(0, daysBetween(range.start, d)) * colWidth()
  }, [range])

  // The month in the title and the "Azi" button follow the days on screen.
  const [first, setFirst] = useState(BEFORE - 1)
  useEffect(() => {
    const el = board.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / colWidth())
        setFirst(i)
        // Near the end: more days.
        if (el.scrollLeft + el.clientWidth > el.scrollWidth - 6 * colWidth()) setRange((r) => ({ ...r, count: r.count + MORE }))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  const shownMonth = days[Math.min(days.length - 1, Math.max(0, first))] ?? t
  const todayIndex = daysBetween(range.start, t)
  const todayOnScreen = todayIndex >= first && todayIndex <= first + 2

  // ---- shopping: what's planned from today on, for a week ----
  const shopWeek = () => {
    const end = dayKey(addDays(t, 6))
    const upcoming = plan.filter((e) => e.day >= todayKey && e.day <= end && byId.has(e.recipeId))
    if (!upcoming.length) { showToast('Nicio rețetă în următoarele 7 zile.'); return }
    const added = addPlanToShopping(upcoming.map((e) => {
      const recipe = byId.get(e.recipeId)!
      return { recipe, servings: e.servings ?? recipe.servings }
    }))
    showToast(added ? `Am pus ${added} ${added === 1 ? 'ingredient' : 'ingrediente'} în listă` : 'Ingredientele sunt deja în listă')
  }
  const navigate = useNavigate()
  const menuEntry = menu && plan.find((e) => e.id === menu.id)

  return (
    <section className="week wk">
      <div className="wk-head">
        <div className="wk-titles">
          <h1 className="wk-kicker">Săptămâna mea</h1>
          <button type="button" className="wk-month" onClick={() => setCalendar(true)} aria-label={`${monthLabel(shownMonth)}, alege o zi`}>
            {monthLabel(shownMonth)} <Chevron dir="down" />
          </button>
        </div>
        <span className="menu-anchor wk-shop-anchor">
          <button type="button" className="wk-round" aria-haspopup="menu" aria-expanded={shopMenu} aria-label="Cumpărături" onClick={() => setShopMenu((v) => !v)}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON.cart} /></svg>
          </button>
          {shopMenu && (
            <PopMenu label="Cumpărături" onClose={closeShop}>
              <MenuRow icon={ICON.cart} onClick={() => { closeShop(); shopWeek() }}>Pune în listă ce gătești în 7 zile</MenuRow>
              <MenuRow icon={ICON.list} onClick={() => { closeShop(); navigate('/cumparaturi') }}>Vezi lista de cumpărături</MenuRow>
            </PopMenu>
          )}
        </span>
      </div>

      {/* Away from today: a pill above the tab bar brings it back, like "Today" in Calendar. */}
      {!todayOnScreen && (
        <button type="button" className="wk-today" onClick={() => scrollToDay(addDays(t, -1))}>
          {todayIndex < first && <Chevron dir="left" />}Azi{todayIndex > first + 2 && <Chevron dir="right" />}
        </button>
      )}

      <div className="wk-board" ref={board}>
        {days.map((d) => {
          const k = dayKey(d)
          const entries = byDay.get(k) ?? []
          const isToday = k === todayKey
          return (
            <section key={k} className={`wk-col${isToday ? ' today' : ''}${k < todayKey ? ' past' : ''}`} aria-label={`${dayName(d)}, ${shortDate(d)}${isToday ? ', azi' : ''}`}>
              <div className="wk-day">
                <small>{isToday ? `Azi · ${dayName(d)}` : dayName(d)}</small>
                <b>{String(d.getDate()).padStart(2, '0')}</b>
              </div>
              <div className="wk-col-body">
                {entries.length > 0 && (
                  <ul className="wk-cards">
                    {entries.map((e) => (
                      <Card key={e.id} e={e} r={byId.get(e.recipeId)} loaded={loaded} menuOpen={menu?.id === e.id}
                        onMenu={(at) => setMenu(at ? { id: e.id, at } : undefined)} />
                    ))}
                  </ul>
                )}
                <button type="button" className="wk-add" onClick={() => setPicking(d)} aria-label={`Adaugă o rețetă ${isToday ? 'azi' : `${dayName(d).toLowerCase()}, ${shortDate(d)}`}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {menu && menuEntry && <CardMenu at={menu.at} e={menuEntry} r={byId.get(menuEntry.recipeId)} onClose={closeMenu} onMove={() => setMoving(menuEntry)} />}
      {moving && <MoveSheet e={moving} r={byId.get(moving.recipeId)} onClose={() => setMoving(undefined)} />}
      {picking && <RecipePicker day={picking} recipes={recipes} onClose={() => setPicking(undefined)} />}
      {calendar && (
        <MonthSheet month={shownMonth} planned={new Set(plan.map((e) => e.day))} onClose={() => setCalendar(false)}
          onPick={(d) => { setCalendar(false); scrollToDay(addDays(d, -1)) }} />
      )}
    </section>
  )
}

