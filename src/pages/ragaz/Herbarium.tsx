// The herbarium on screen: the moment a plant comes ("Presează în ierbar"), the herbarium page
// (/ragaz/ierbar) where it flies onto its place, and the row on the Răgaz home that opens it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Sheet from '../../components/Sheet'
import { useBack } from '../../lib/back'
import { cardSvg, plantSvg } from '../../lib/mind/herbArt'
import { HERB_GROUPS, herbOf, visibleHerbs, type Herb, type HerbBook } from '../../lib/mind/herbarium'
import { checkHerbarium, herbHasProgram, markPressed, plantProgress, putOffPlant, setQuiet, useHerbBook, usePendingPlants } from '../../lib/mind/herbStore'
import { monthName, thisMonth } from '../../lib/mind/model'
import '@fontsource/caveat/latin-600.css'
import '@fontsource/caveat/latin-ext-600.css'
import '../../ragaz.css'

type Landing = { fly?: string; backLabel?: string; backTo?: string }

const dayText = (iso: string) => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Where the herbarium's back button leads, in words. */
function backLabelFor(path: string) {
  if (path === '/ragaz') return 'Înapoi la Răgaz'
  if (path.startsWith('/ragaz/planifica')) return 'Înapoi la planificare'
  if (path.startsWith('/ragaz/jurnal')) return 'Înapoi la jurnal'
  if (path.startsWith('/ragaz/exercitii')) return 'Înapoi la exerciții'
  return 'Înapoi'
}

function Plant({ h, missing, className }: { h: Herb; missing?: boolean; className?: string }) {
  const html = useMemo(() => plantSvg(h.art, missing), [h.art, missing])
  return <span className={`hb-plant ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}
function Card({ h, className }: { h: Herb; className?: string }) {
  const html = useMemo(() => cardSvg(h.art, h.lvl ? `${h.plant} · ${h.lvl}` : h.plant), [h])
  return <span className={`hb-card ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

// Pages where a plant never interrupts: in the middle of a chat, a worry list or a Friday.
const BUSY = /^\/ragaz\/(claude|griji|vineri|ierbar)/

/**
 * The moment a plant comes: its card settles on the table, with what brought it. "Presează în
 * ierbar" takes it to the herbarium; "Mai târziu" leaves it waiting there. Mounted inside the
 * Răgaz gate, so it only ever shows with the vault open.
 */
export function HerbMoment() {
  const pending = usePendingPlants()
  const book = useHerbBook()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const id = BUSY.test(pathname) ? undefined : pending[0]
  // Turned off: plants go quietly to the herbarium.
  useEffect(() => { if (id && book?.quiet) putOffPlant(id) }, [id, book?.quiet])
  const h = id ? herbOf(id) : undefined
  if (!h || book?.quiet) return null
  const press = () => nav('/ragaz/ierbar', { state: { fly: h.id, backLabel: backLabelFor(pathname), backTo: pathname + window.location.search } satisfies Landing })
  return (
    <div className="hb-layer" role="dialog" aria-modal="true" aria-label={`O plantă pentru ierbar: ${h.name}`}>
      <div className="hb-pop">
        <Card h={h} className="hb-press" />
        <div className="hb-text">
          <span className="rg-label">O plantă pentru ierbar</span>
          <b className="hb-name">{h.name}</b>
          <p>{h.how}</p>
          <em>Ți-ai făcut timp pentru tine.</em>
        </div>
        <button type="button" className="moon-btn hb-btn" autoFocus onClick={press}>Presează în ierbar</button>
        <button type="button" className="link-btn hb-later" onClick={() => putOffPlant(h.id)}>Mai târziu</button>
      </div>
    </div>
  )
}

/**
 * A plant on its way here: its card rises from the middle of the screen and glides onto its
 * place on the page, then a soft ring. Returns the id still in the air (its place stays empty).
 */
function useLanding(holder: React.RefObject<HTMLElement | null>, book?: HerbBook) {
  const { state: navState } = useLocation()
  const fly = ((navState ?? {}) as Landing).fly
  const due = fly && book?.earned[fly] && !book.seen.includes(fly) ? fly : undefined
  const [inAir, setInAir] = useState<string>()
  const [landed, setLanded] = useState<string>()
  const started = useRef<string>(undefined)
  const start = useCallback((id: string) => {
    if (started.current === id) return
    started.current = id
    const h = herbOf(id)
    const place = holder.current?.querySelector<HTMLElement>(`[data-plant="${id}"] .hb-plant`)
    if (!h || !place || reducedMotion()) { void markPressed(id); return }
    setInAir(id)
    place.scrollIntoView({ block: 'center' })
    requestAnimationFrame(() => {
      const to = place.getBoundingClientRect()
      const w = Math.min(window.innerWidth * 0.5, 200), hgt = w * 1.36
      const x0 = (window.innerWidth - w) / 2, y0 = window.innerHeight * 0.4 - hgt / 2
      const el = document.createElement('div')
      el.className = 'hb-flyer'
      el.innerHTML = cardSvg(h.art, h.plant)
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px` })
      document.body.appendChild(el)
      // The plant in the card is its 100-wide top part: land that on the place.
      const k = to.width / w
      const dx = to.left - x0, dy = to.top - y0 - 12 * k * (w / 100)
      const anim = el.animate([
        { transform: 'rotate(-2deg)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + k) / 2}) rotate(3deg)`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`, opacity: 0.2 },
      ], { duration: 1100, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' })
      const land = () => {
        el.remove()
        void markPressed(id)
        setInAir(undefined)
        setLanded(id)
        setTimeout(() => setLanded((x) => (x === id ? undefined : x)), 1400)
      }
      anim.finished.then(land, land)
    })
  }, [holder])
  useEffect(() => {
    if (!due) return
    const t = setTimeout(() => start(due), 160)
    return () => clearTimeout(t)
  }, [due, start])
  return { inAir: inAir ?? due, landed }
}

/** One plant's sheet: what brings it, and when it came or how far along it is. */
function PlantSheet({ h, earned, onClose }: { h: Herb; earned?: string; onClose: () => void }) {
  const hidden = h.secret && !earned
  const [have, need] = plantProgress(h.id)
  return (
    <Sheet title={hidden ? 'Surpriză' : h.name} onClose={onClose} grab>
      <div className="hb-detail">
        {earned ? <Card h={h} /> : <Plant h={h} missing className="hb-detail-sketch" />}
        <p>{hidden ? 'Vine de la sine, făcând ce faci de obicei în Răgaz.' : h.how}</p>
        {earned ? <small>Presată pe {dayText(earned)}</small>
          : !hidden && need > 1 && have > 0 && <small>{Math.min(have, need)} din {need}</small>}
      </div>
    </Sheet>
  )
}

/** /ragaz/ierbar: the plants pressed so far, the missing ones sketched in pencil, and the months. */
export default function Herbarium() {
  const book = useHerbBook()
  const { backLabel, backTo } = (useLocation().state ?? {}) as Landing
  const back = useBack(backTo ?? '/ragaz')
  const holder = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Herb>()
  useEffect(() => { void checkHerbarium() }, [])
  const { inAir, landed } = useLanding(holder, book)
  if (!book) return <section className="ragaz rg-page"><p className="rg-sub">Se deschide ierbarul…</p></section>

  const herbs = visibleHerbs(herbHasProgram())
  const has = (id: string) => !!book.earned[id] && id !== inAir
  const seen = new Set(book.seen)
  const count = herbs.filter((h) => has(h.id)).length
  // The months: those already pressed, and this month while it waits for its reflection.
  const months = [...new Set([...Object.keys(book.earned).filter((id) => id.startsWith('luna:')), `luna:${thisMonth()}`])].sort()
  const monthCount = months.filter(has).length

  const cell = (h: Herb) => {
    const earned = has(h.id) ? book.earned[h.id] : undefined
    const waiting = !!earned && !seen.has(h.id)
    return (
      <button type="button" key={h.id} data-plant={h.id} className={`hb-cell${earned ? '' : ' off'}${landed === h.id ? ' landed' : ''}${waiting ? ' waiting' : ''}`}
        onClick={() => { if (waiting) void markPressed(h.id); else setOpen(h) }}
        aria-label={waiting ? `${h.name}: presează în ierbar` : earned ? h.name : h.secret ? 'Surpriză' : `${h.name}, încă nu`}>
        <Plant h={h} missing={!earned} />
        <span className="hb-cell-name">{h.secret && !earned ? 'Surpriză' : h.name}</span>
        {h.lvl && <span className="hb-lvl">{h.lvl}</span>}
        {waiting && <span className="hb-tag">Presează</span>}
      </button>
    )
  }

  return (
    <section className="ragaz hb-page">
      <div className="hb-paper" ref={holder}>
        <div className="hb-top">
          {backLabel ? (
            <button type="button" className="hb-back-pill" onClick={back}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              <span>{backLabel}</span>
            </button>
          ) : (
            <button type="button" className="hb-back" aria-label="Înapoi" onClick={back}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          )}
          <span className="hb-count">{count} din {herbs.length}{monthCount ? ` · ${monthCount} ${monthCount === 1 ? 'lună' : 'luni'}` : ''}</span>
        </div>
        <h1 className="hb-title">Ierbarul meu</h1>

        <h2 className="hb-group">Lunile mele</h2>
        <div className="hb-grid">
          {months.map((id) => {
            const h = herbOf(id)
            if (!h) return null
            return cell(id === `luna:${thisMonth()}` && !book.earned[id] ? { ...h, how: `Vine când scrii reflecția lunii ${monthName(thisMonth())}.` } : h)
          })}
        </div>

        {HERB_GROUPS.map((g) => {
          const list = herbs.filter((h) => h.group === g)
          if (!list.length) return null
          return (
            <div key={g}>
              <h2 className="hb-group">{g}</h2>
              <div className="hb-grid">{list.map(cell)}</div>
            </div>
          )
        })}

        <p className="hb-note">Plantele vin când îți faci timp pentru tine, oricât de rar. Nu se pierde niciuna. Ierbarul stă criptat în Răgaz, doar pe telefonul tău și în copia ta de siguranță.</p>
        <label className="hb-quiet">
          <input type="checkbox" checked={!book.quiet} onChange={(e) => void setQuiet(!e.target.checked)} />
          <span>Arată momentul când vine o plantă</span>
        </label>
      </div>
      {open && <PlantSheet h={open} earned={book.earned[open.id]} onClose={() => setOpen(undefined)} />}
    </section>
  )
}

/** The row on the Răgaz home: how many plants, and the latest three. */
export function HerbRow() {
  const book = useHerbBook()
  const earned = Object.entries(book?.earned ?? {}).sort((a, b) => b[1].localeCompare(a[1]))
  const waiting = earned.some(([id]) => !book?.seen.includes(id))
  const latest = earned.slice(0, 3).map(([id]) => herbOf(id)).filter((h): h is Herb => !!h)
  const n = earned.length
  return (
    <Link to="/ragaz/ierbar" className="rg-card rg-link hb-row">
      <div>
        <b>Ierbarul meu{waiting && <span className="hb-dot" aria-label=", o plantă de presat" />}</b>
        <small>{n ? `${n} ${n === 1 ? 'plantă' : 'plante'}` : 'Prima plantă vine cu primul lucru făcut pentru tine.'}</small>
      </div>
      <span className="hb-row-plants" aria-hidden="true">{latest.map((h) => <Plant key={h.id} h={h} />)}</span>
    </Link>
  )
}
