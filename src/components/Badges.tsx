// Stamps and stickers on screen: the drawings, the moment one is earned ("Timbru nou" with the
// postmark, or "Ura!" with the sticker to stick), the culinary passport (Profile, at
// /profil/clasor) and the sticker notebook (stories), both turned page by page (Flipbook).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Sheet from './Sheet'
import { BADGE, STAMPS, STAMP_GROUPS, STICKERS, STICKER_GROUPS, type Badge } from '../lib/badges/catalog'
import { inked, plainStampSvg, stampSvg, stickerSvg } from '../lib/badges/art'
import { progressOf } from '../lib/badges/engine'
import { backLabelFor } from '../lib/badges/backLabel'
import { markSeen, putOff, startBadges, useBadges, usePendingBadges } from '../lib/badges/store'
import { useBack } from '../lib/back'
import { useKid } from '../lib/kidMode'
import { useMyName } from '../lib/me'
import { myEmail } from '../lib/space'
import Flipbook, { type BookHandle, type BookPage } from './Flipbook'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/caveat/latin-ext-700.css'
import '../badges.css'

const romanDay = (iso: string) => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')

/** The drawing of a badge: a stamp (with its postmark once earned) or a sticker. */
export function BadgeArt({ b, earned, wide, plain, ink, className }: { b: Badge; earned?: string; wide?: boolean; plain?: boolean; ink?: string; className?: string }) {
  const html = useMemo(() => {
    const svg = b.kind !== 'stamp' ? stickerSvg(b, !!earned)
      : plain ? plainStampSvg(b) : stampSvg(b, earned ? new Date(earned) : undefined, { wide })
    // A missing badge on light paper: its white outline drawn in the page's ink.
    return ink && !earned ? inked(svg, ink, 1.7) : svg
  }, [b, earned, wide, plain, ink])
  return <span className={`bd-art ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

/** The four-pointed sparkles around a new sticker. */
const TWINKLES = [[8, 14, 0], [86, 22, 0.5], [14, 78, 0.9], [84, 80, 0.3], [48, 2, 1.2], [2, 48, 0.7], [94, 54, 1.4]]

/** What the album and clasor are told when a new badge is on its way to them. */
type Landing = { fly?: string; backLabel?: string; backTo?: string }

/**
 * Celebrates the badges just earned, one at a time: "Timbru nou" with the postmark, or "Ura!"
 * with the sticker. Its button takes the badge to the clasor or the album, where it flies into
 * its place (useLanding); the back button there returns to the page it was earned on.
 * Mounted once, in the app shell.
 */
export function BadgeCelebration() {
  const pending = usePendingBadges()
  const { pathname, state: navState } = useLocation()
  const nav = useNavigate()
  useEffect(() => { startBadges() }, [])
  const landing = (navState ?? {}) as Landing
  // Not over Răgaz (private), nor while a badge is flying into the album or clasor.
  const quiet = pathname.startsWith('/ragaz') || (!!landing.fly && pending[0] === landing.fly)
  const id = quiet ? undefined : pending[0]
  const b = id ? BADGE.get(id) : undefined
  const state = useBadges()
  if (!b) return null
  const earned = state.earned[b.id]

  /** To the clasor or the album, remembering where we came from (kept when already there). */
  const place = () => {
    const to = b.kind === 'stamp' ? '/profil/clasor' : '/povesti/album'
    const there = pathname === to
    const back = there ? { backLabel: landing.backLabel, backTo: landing.backTo } : { backLabel: backLabelFor(pathname), backTo: pathname }
    nav(to, { state: { fly: b.id, ...back } satisfies Landing, replace: there })
  }

  if (b.kind === 'stamp') {
    const next = nextInSeries(b)
    return (
      <div className="bd-layer" role="dialog" aria-modal="true" aria-label={`Timbru nou: ${b.name}`}>
        <div className="bd-pop">
          <span className="bd-eyebrow">Timbru nou</span>
          <div className="bd-scene">
            <div className="bd-ripple" aria-hidden="true" />
            <BadgeArt b={b} earned={earned} wide className="bd-stamp-big bd-anim" />
          </div>
          <b className="bd-name">{b.name}</b>
          <p className="bd-how">{b.how}{next ? ` Următorul timbru: ${next.name}.` : ''}</p>
          <button type="button" className="btn primary bd-btn" autoFocus onClick={place}>Pune în pașaport</button>
          <button type="button" className="bd-link" onClick={() => markSeen(b.id)}>Gata</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bd-layer bd-kid" role="dialog" aria-modal="true" aria-label={`Abțibild nou: ${b.name}`}>
      <div className="bd-ura">
        <span className="bd-ura-title">Ura!</span>
        <div className="bd-reward">
          <div className="bd-glow" aria-hidden="true" />
          {TWINKLES.map(([x, y, d], i) => (
            <svg key={i} className="bd-tw" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 1L14.5 9.5L23 12L14.5 14.5L12 23L9.5 14.5L1 12L9.5 9.5Z" fill="#ffd76a" />
            </svg>
          ))}
          <BadgeArt b={b} earned={earned} className="bd-sticker-big" />
        </div>
        <b className="bd-ura-name">{b.name}</b>
        <p className="bd-ura-how">{b.how}</p>
        <button type="button" className="bd-kbtn" autoFocus onClick={place}>Lipește în album</button>
        <button type="button" className="bd-kbtn soft" onClick={() => putOff(b.id)}>Mai târziu</button>
      </div>
    </div>
  )
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A badge on its way here (from the celebration, or a waiting sticker tapped in the album):
 * a copy rises from the middle of the screen, flies in an arc to its place and presses in,
 * with a ripple and sparkles. Returns the id still in the air (its place stays empty until then).
 */
function useLanding(holder: React.RefObject<HTMLElement | null>, reach?: (id: string) => Promise<void>) {
  const { state: navState } = useLocation()
  const state = useBadges()
  const coming = ((navState ?? {}) as Landing).fly
  const due = coming && state.earned[coming] && !state.seen.includes(coming) ? coming : undefined
  const [inAir, setInAir] = useState<string>()
  const [landed, setLanded] = useState<string>()
  const started = useRef<string>(undefined)
  /** The flight itself, once the badge's page is showing. */
  const launch = useCallback((id: string) => {
    const b = BADGE.get(id)
    const root = holder.current
    const place = root?.querySelector<HTMLElement>(`[data-badge="${id}"]`)
    if (!b || !place || reducedMotion()) { markSeen(id); return }
    setInAir(id)
    place.scrollIntoView({ block: 'center' })
    requestAnimationFrame(() => {
      const to = (place.querySelector('.bd-art') ?? place).getBoundingClientRect()
      const stamp = b.kind === 'stamp'
      // Start where the celebration showed it: big, in the middle of the screen. A stamp flies
      // without its postmark (the place's drawing is 150 wide, the stamp itself 120 of it).
      const w = Math.min(window.innerWidth * (stamp ? 0.42 : 0.6), stamp ? 170 : 230)
      const h = stamp ? w * (124 / 120) : w
      const x0 = (window.innerWidth - w) / 2, y0 = window.innerHeight * 0.42 - h / 2
      const el = document.createElement('div')
      el.className = 'bd-flyer'
      el.innerHTML = stamp ? plainStampSvg(b) : stickerSvg(b, true)
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px` })
      document.body.appendChild(el)
      const k = (stamp ? to.width * (120 / 150) : to.width) / w
      const dx = to.left - x0, dy = to.top - y0
      const anim = el.animate([
        { transform: 'none', opacity: 0.6 },
        { transform: 'translate(0, -16px) scale(1.1) rotate(-6deg)', opacity: 1, offset: 0.18 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 80}px) scale(${(1 + k) / 2}) rotate(8deg)`, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)` },
      ], { duration: 950, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' })
      const land = () => {
        el.remove()
        markSeen(id)
        setInAir(undefined)
        setLanded(id)
        setTimeout(() => setLanded((x) => (x === id ? undefined : x)), 1200)
        sparkle(to, !stamp)
      }
      anim.finished.then(land, land)
    })
  }, [holder])
  /** Turns the book to the badge's page first (reach), then flies it in. */
  const start = useCallback((id: string) => {
    if (started.current === id) return
    started.current = id
    void (reach?.(id) ?? Promise.resolve()).then(() => launch(id))
  }, [reach, launch])
  useEffect(() => {
    if (!due) return
    // Let the page lay out first (and the stickers' slots exist).
    const t = setTimeout(() => start(due), 120)
    return () => clearTimeout(t)
  }, [due, start])
  return { inAir: inAir ?? due, landed, flyIn: start }
}

/** The press-in: a ring and, for stickers, a little burst of dots around the place. */
function sparkle(r: DOMRect, dots: boolean) {
  const box = document.createElement('div')
  box.className = 'bd-land'
  Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
  box.innerHTML = '<span class="bd-land-ring"></span>' + (dots ? Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2, d = 38 + (i % 3) * 10
    return `<i style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px"></i>`
  }).join('') : '')
  document.body.appendChild(box)
  setTimeout(() => box.remove(), 900)
}

/** The next stamp of the same series (same drawing, bigger number), if any. */
function nextInSeries(b: Badge) {
  if (!b.lvl) return undefined
  return STAMPS.find((x) => x.art === b.art && (x.lvl ?? 0) > (b.lvl ?? 0))
}

/** "18 din 25" under a missing badge that has started, empty otherwise. */
function progressText(b: Badge, have: number, need: number) {
  if (b.secret || need <= 1 || have <= 0 || b.id === 'an') return ''
  return `${have} din ${need}`
}

/** One badge's page: big, what earns it, the date or how far along it is. */
function BadgeSheet({ b, onClose }: { b: Badge; onClose: () => void }) {
  const state = useBadges()
  const earned = state.earned[b.id]
  const p = progressOf(b, state, new Date())
  const hidden = b.secret && !earned
  const [spoiler, setSpoiler] = useState(false)
  const progress = progressText(b, p.have, p.need)
  const series = b.lvl ? STAMPS.filter((x) => x.art === b.art) : []
  return (
    <Sheet title={hidden ? 'Surpriză' : b.name} onClose={onClose} grab>
      <div className={`bd-detail${b.kind === 'sticker' ? ' kid' : ''}`}>
        <BadgeArt b={b} earned={earned} className="bd-detail-art" />
        <b className="bd-name">{hidden ? 'Surpriză' : b.name}</b>
        <p className="bd-how">{hidden ? 'O descoperi făcând ce faci de obicei în aplicație, doar puțin altfel.' : b.how}</p>
        {/* Spoiler: the secret's rule, only when asked for. */}
        {hidden && (spoiler
          ? <p className="bd-spoiler" role="status"><b>Cum o primești</b>{b.how}</p>
          : <button type="button" className="bd-spoiler-btn" onClick={() => setSpoiler(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            Arată ce trebuie să faci
          </button>)}
        {earned ? <p className="bd-when">Primit pe {romanDay(earned)}</p> : progress && (
          <div className="bd-progress">
            <div className="bd-bar"><i style={{ width: `${Math.round((p.have / p.need) * 100)}%` }} /></div>
            <span>{progress}</span>
          </div>
        )}
        {series.length > 1 && (
          <div className="bd-series" aria-label="Seria">
            {series.map((x) => <BadgeArt key={x.id} b={x} earned={state.earned[x.id]} />)}
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** Splits a list into pages of at most `max`, as evenly as possible (19 by 4: 4, 4, 4, 4, 3). */
function pagesOf<T>(list: T[], max: number) {
  const n = Math.ceil(list.length / max), out: T[][] = []
  let i = 0
  for (let p = 0; p < n; p++) { const size = Math.ceil((list.length - i) / (n - p)); out.push(list.slice(i, i + size)); i += size }
  return out
}

/** The named way back after a new badge, as on the page it was earned. */
function BackPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="bd-back-pill" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      <span>{label}</span>
    </button>
  )
}

/* ---------------- the culinary passport (stamps) ---------------- */

/** Each chapter of the passport has its own ink: the page's security print, frames and numbers. */
const VISA_INK: Record<string, string> = { 'Adăugare': '#a8424f', 'La gătit': '#2f7a6d', 'Plan și caiet': '#3f5f9e', 'Familie': '#a8742a', 'Surprize': '#6d4c9a' }

/** The passport's emblem: a chef's hat in a wreath, under a star. */
function Emblem({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="50" cy="50" r="46" strokeWidth="1.2" /><circle cx="50" cy="50" r="42" strokeWidth=".7" strokeDasharray="1 3" />
      <path d="M36 62V52c-8-2-11-11-5-17 4-4 10-4 13-2 3-8 13-8 16 0 5-4 13-1 14 6 1 7-4 12-10 13v10z" /><path d="M36 67h28" />
      <path d="M42 54v6M50 53v7M58 54v6" strokeWidth="1.4" />
      <path d="M18 58c2 12 10 20 22 24M82 58c-2 12-10 20-22 24M19 64l-5-1M22 71l-5 1M27 77l-4 3M81 64l5-1M78 71l5 1M73 77l4 3" strokeWidth="1.4" />
      <path d="M50 14l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3-3.7-2.4-3.7 2.4 1.1-4.3-3.4-2.8 4.4-.3z" strokeWidth="1.2" />
    </svg>
  )
}

/** The security print of a visa page (wavy lines and a rosette), in the chapter's ink. */
const guillocheCache = new Map<string, string>()
function guilloche(ink: string) {
  let url = guillocheCache.get(ink)
  if (url) return url
  const W = 282, H = 470, lines: string[] = []
  for (let k = 0; k < 31; k++) {
    let d = ''
    for (let x = 0; x <= W; x += 6) d += `${x ? 'L' : 'M'}${x} ${(k * 16 - 8 + 8 * Math.sin(x / 24 + k * 0.55) + 3.5 * Math.sin(x / 8 + k * 1.3)).toFixed(1)}`
    lines.push(`<path d="${d}"/>`)
  }
  let rose = ''
  for (let a = 0; a < 180; a += 10) rose += `<ellipse cx="141" cy="245" rx="122" ry="45" transform="rotate(${a} 141 245)"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" fill="none" stroke="${ink}"><g stroke-width=".55" opacity=".2">${lines.join('')}</g><g stroke-width=".5" opacity=".16">${rose}</g></svg>`
  url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  guillocheCache.set(ink, url)
  return url
}

/** Letters for the passport's machine-readable lines: capitals without diacritics, spaces as "<". */
const mrz = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '<')
const pad = (s: string, n: number) => (s + '<'.repeat(n)).slice(0, n)
const two = (n: number) => String(n).padStart(2, '0')

/**
 * Profile › "Pașaportul meu": the recipe stamps as visas in a passport turned page by page: a
 * leather cover, the holder's page (name, since when, how far in each chapter), then four visas
 * a page, chapter by chapter, each chapter in its own ink. A new stamp turns the passport to
 * its page and lands there (useLanding), with its postmark slammed on.
 */
export function Clasor() {
  const state = useBadges()
  const name = useMyName()
  const [open, setOpen] = useState<Badge>()
  const book = useRef<BookHandle>(null)
  const holder = useRef<HTMLDivElement>(null)
  const chapters = useMemo(() => STAMP_GROUPS.map((g) => ({ g, pages: pagesOf(STAMPS.filter((b) => b.group === g), 4) })), [])
  const pageOf = useMemo(() => {
    const m = new Map<string, number>()
    let n = 2
    for (const c of chapters) for (const part of c.pages) { for (const b of part) m.set(b.id, n); n++ }
    return m
  }, [chapters])
  const reach = useCallback(async (id: string) => { await book.current?.goTo(pageOf.get(id) ?? 0) }, [pageOf])
  const { inAir, landed } = useLanding(holder, reach)
  const { backLabel, backTo } = (useLocation().state ?? {}) as Landing
  const back = useBack(backTo ?? '/profil')
  const has = (b: Badge) => !!state.earned[b.id] && b.id !== inAir
  const have = STAMPS.filter(has).length
  const who = name || myEmail()?.split('@')[0] || 'Bucătar'
  const since = state.since ? new Date(state.since) : new Date()
  const issued = since.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '').toUpperCase()
  const ymd = `${String(since.getFullYear()).slice(2)}${two(since.getMonth() + 1)}${two(since.getDate())}`

  const pages: BookPage[] = []
  pages.push({ key: 'cover', label: 'Coperta', back: <div className="pp-backv" />, node: (
    <div className="pp-cover">
      <Emblem className="pp-emb" />
      <b className="pp-foil">PAȘAPORT<br />CULINAR</b>
      <small className="pp-foil">REȚETELE MELE</small>
      <svg className="pp-chip" viewBox="0 0 30 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="1" y="1" width="28" height="18" rx="3" /><circle cx="15" cy="10" r="4" /><path d="M1 10h10M19 10h10" /></svg>
      <span className="pp-hint">Atinge ca să deschizi</span>
    </div>
  ) })
  pages.push({ key: 'holder', label: 'Titular', back: <div className="pp-backv" />, node: (
    <div className="pp-visa pp-id" style={{ '--tint': VISA_INK['Adăugare'], backgroundImage: guilloche(VISA_INK['Adăugare']) } as React.CSSProperties}>
      <div className="pp-head">Pașaport culinar<span>RO</span></div>
      <div className="pp-photo"><Emblem /></div>
      <dl>
        <div><dt>Titular</dt><dd>{who}</dd></div>
        <div><dt>Bucătăria</dt><dd>Kitchen Tales</dd></div>
        <div><dt>Eliberat la</dt><dd>{issued}</dd></div>
        <div><dt>Vize</dt><dd>{have} din {STAMPS.length}</dd></div>
      </dl>
      <span className="pp-sig">{who}</span>
      <div className="pp-prog">
        {chapters.map(({ g }) => {
          const list = STAMPS.filter((b) => b.group === g), got = list.filter(has).length
          return <div key={g} style={{ '--c': VISA_INK[g], '--p': `${Math.round((got / list.length) * 100)}%` } as React.CSSProperties}>{g}<span>{got} / {list.length}</span><i /></div>
        })}
      </div>
      <div className="pp-mrz">{pad(`P<RO${mrz(who)}<<BUCATAR`, 44)}<br />{pad(`KT${ymd}RO<<${two(have)}<${STAMPS.length}`, 44)}</div>
    </div>
  ) })
  let no = 0
  for (const { g, pages: parts } of chapters) {
    const ink = VISA_INK[g]
    for (const part of parts) {
      const n = pages.length
      pages.push({ key: `${g}-${n}`, label: g, back: <div className="pp-backv" />, node: (
        <div className="pp-visa" style={{ '--tint': ink, backgroundImage: guilloche(ink) } as React.CSSProperties}>
          <Emblem className="pp-wm" />
          <div className="pp-head">Vize · {g}<span>{two(n)}</span></div>
          <div className="pp-field">
            {part.map((b, k) => {
              no++
              const earned = has(b) ? state.earned[b.id] : undefined
              const hidden = b.secret && !earned
              return (
                <div className="pp-cell" key={b.id}>
                  <span className="pp-no">VIZA {two(no)}</span>
                  <button type="button" data-badge={b.id} className={`pp-slot${earned ? ' on' : ' off'}${landed === b.id ? ' landed' : ''}`} style={{ '--r': `${earned ? [-4, 3, 2.5, -3][k] : 0}deg` } as React.CSSProperties}
                    aria-label={hidden ? 'Surpriză' : `${b.name}${earned ? '' : ', lipsă'}`} onClick={() => setOpen(b)}>
                    <BadgeArt b={b} earned={earned} ink={earned ? undefined : '95 55 62'} className={landed === b.id ? 'bd-postmark' : undefined} />
                  </button>
                  <span className={`pp-cap${earned ? ' on' : ''}`}>{hidden ? 'Surpriză' : b.name}</span>
                </div>
              )
            })}
          </div>
          <span className="pp-folio l">KT·{ymd.slice(0, 4)}</span>
          <span className="pp-folio">{two(n)}</span>
        </div>
      ) })
    }
  }
  pages.push({ key: 'end', label: 'Pagini libere', back: <div className="pp-backv" />, node: (
    <div className="pp-visa" style={{ '--tint': VISA_INK['Plan și caiet'], backgroundImage: guilloche(VISA_INK['Plan și caiet']) } as React.CSSProperties}>
      <Emblem className="pp-wm" />
      <div className="pp-head">Vize<span>{two(pages.length)}</span></div>
      <span className="pp-folio l">pagini libere pentru ce urmează</span>
    </div>
  ) })

  return (
    <div className="bd-passport" ref={holder}>
      {backLabel && <BackPill label={backLabel} onClick={back} />}
      <Flipbook ref={book} pages={pages} label="Pașaportul culinar" className="pp" edges={['#e9e2d2', '#cbc1ad']} />
      {open && <BadgeSheet b={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

/* ---------------- the notebook of stickers ---------------- */

/** The notebook's chapters: the washi tape and tab color, and the cardboard of its pages. */
const CHAPTERS: Record<string, { short: string; tape: string; paper: string }> = {
  'La ascultat': { short: 'Ascultat', tape: '#f5b453', paper: '#272d55' },
  'La făcut povești': { short: 'Făcut', tape: '#ef8fae', paper: '#4b2545' },
  'Obiceiuri bune': { short: 'Obiceiuri', tape: '#7cc795', paper: '#1c4541' },
}

/** Little white-pen drawings in the corner of a page (one per page, in turn) and the dotted trail at its foot. */
const DOODLES = [
  ['0 0 46 34', '<path d="M14 3l3 8 8 1-6 6 2 9-7-5-8 4 2-9-6-6 9-1z"/><path d="M36 20l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/><path d="M40 6v4M38 8h4"/>'],
  ['0 0 48 40', '<path d="M30 6c-9 1-15 9-13 18 2 8 10 13 19 11-11 8-27 1-28-13C7 9 19 0 30 6z"/><path d="M40 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>'],
  ['0 0 48 34', '<path d="M4 20c6-14 20-16 26-6s-6 18-13 12 2-13 7-9"/><path d="M38 8l4-4M40 16h6"/>'],
  ['0 0 48 30', '<path d="M3 12c4-8 10-8 14 0s10 8 14 0 10-8 14 0"/><path d="M3 24c4-8 10-8 14 0s10 8 14 0 10-8 14 0" opacity=".6"/>'],
  ['0 0 44 38', '<path d="M22 34C6 24 2 14 8 8c5-5 12-2 14 4 2-6 9-9 14-4 6 6 2 16-14 26z"/>'],
]
const TRAIL = '<path d="M2 20c10-16 22 10 34-4s20-10 28-2" stroke-dasharray="1 7"/><path d="M70 10l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/>'
function Pen({ box, d, className }: { box: string; d: string; className: string }) {
  return <svg className={className} viewBox={box} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
}

/**
 * /povesti/album: the stickers in a spiral notebook of colored cardboard, turned page by page,
 * four stickers a page, a chapter (and a color) per group, with tabs to jump between chapters.
 * For the child too (kid mode). Stickers waiting to be stuck glow; a new one turns the
 * notebook to its page and flies in there.
 */
export function Album() {
  const state = useBadges()
  const kid = useKid().active
  const { backLabel, backTo, fly } = (useLocation().state ?? {}) as Landing
  const back = useBack(backTo ?? '/povesti/acasa')
  const [open, setOpen] = useState<Badge>()
  const [justStuck, setJustStuck] = useState<string>()
  const book = useRef<BookHandle>(null)
  const holder = useRef<HTMLElement>(null)
  const chapters = useMemo(() => STICKER_GROUPS.map((g) => ({ g, pages: pagesOf(STICKERS.filter((b) => b.group === g), 4) })), [])
  const pageOf = useMemo(() => {
    const m = new Map<string, number>()
    let n = 1
    for (const c of chapters) for (const part of c.pages) { for (const b of part) m.set(b.id, n); n++ }
    return m
  }, [chapters])
  const firstOf = (g: string) => Math.min(...chapters.find((c) => c.g === g)!.pages.flat().map((b) => pageOf.get(b.id) ?? 0))
  const reach = useCallback(async (id: string) => { await book.current?.goTo(pageOf.get(id) ?? 0) }, [pageOf])
  const { inAir, landed } = useLanding(holder, reach)
  const seen = new Set(state.seen)
  const has = (b: Badge) => !!state.earned[b.id] && b.id !== inAir
  const have = STICKERS.filter(has).length
  // Open where a sticker waits to be stuck (unless one is flying in: then from the cover).
  const waitingOne = STICKERS.find((b) => state.earned[b.id] && !seen.has(b.id))
  const [start] = useState(() => (!fly && waitingOne ? pageOf.get(waitingOne.id) ?? 0 : 0))
  const stickHere = (b: Badge, el: HTMLElement) => {
    markSeen(b.id)
    setJustStuck(b.id)
    if (!reducedMotion()) sparkle((el.querySelector('.bd-art') ?? el).getBoundingClientRect(), true)
  }
  const latest = STICKERS.filter(has).sort((a, b) => state.earned[b.id].localeCompare(state.earned[a.id])).slice(0, 4)
  const COVER_SPOTS = ['nb-st1', 'nb-st2', 'nb-st3', 'nb-st4']

  const pages: BookPage[] = []
  pages.push({ key: 'cover', label: 'Coperta', back: <div className="nb-paper" style={{ '--paper': '#1f2547' } as React.CSSProperties} />, node: (
    <div className="nb-cover">
      {latest.map((b, k) => <span key={b.id} className={`nb-st ${COVER_SPOTS[k]}`}><BadgeArt b={b} earned={state.earned[b.id]} /></span>)}
      <div className="nb-label"><b>Albumul meu</b><small>{have} din {STICKERS.length} abțibilduri</small></div>
      <span className="nb-hint">Atinge ca să deschizi</span>
    </div>
  ) })
  for (const { g, pages: parts } of chapters) {
    const c = CHAPTERS[g], list = parts.flat(), got = list.filter(has).length
    for (const part of parts) {
      const n = pages.length, [box, d] = DOODLES[n % DOODLES.length]
      pages.push({ key: `${g}-${n}`, label: g, back: <div className="nb-paper nb-back" style={{ '--paper': c.paper } as React.CSSProperties} />, node: (
        <div className="nb-paper" style={{ '--paper': c.paper, '--chap': c.tape } as React.CSSProperties}>
          <div className="nb-washi"><b>{g}</b><span>{got} din {list.length}</span></div>
          <Pen className="nb-dood" box={box} d={d} />
          <Pen className="nb-trail" box="0 0 78 28" d={TRAIL} />
          <div className="nb-slots">
            {part.map((b) => {
              const earned = has(b) ? state.earned[b.id] : undefined
              const waiting = !!earned && !seen.has(b.id)
              const hidden = b.secret && !earned
              return (
                <button type="button" key={b.id} data-badge={b.id} className={`nb-slot${earned ? ' on' : ' off'}${waiting ? ' waiting' : ''}${justStuck === b.id ? ' stuck' : ''}${landed === b.id ? ' landed' : ''}`}
                  aria-label={waiting ? `${b.name}: lipește-l în album` : earned ? b.name : hidden ? 'Surpriză, loc gol' : `${b.name}, loc gol`}
                  onClick={(e) => { if (waiting) stickHere(b, e.currentTarget); else setOpen(b) }}>
                  <BadgeArt b={b} earned={earned} />
                  <span className="nb-name">{hidden ? 'Surpriză' : b.name}</span>
                  {waiting && <span className="bd-slot-tag">Lipește!</span>}
                </button>
              )
            })}
          </div>
          <span className="nb-folio">{n}</span>
        </div>
      ) })
    }
  }
  const lastPaper = CHAPTERS[STICKER_GROUPS[STICKER_GROUPS.length - 1]].paper
  pages.push({ key: 'end', label: 'Ultima pagină', node: (
    <div className="nb-paper nb-end" style={{ '--paper': lastPaper } as React.CSSProperties}>
      <Pen className="nb-dood" box={DOODLES[0][0]} d={DOODLES[0][1]} />
      <b>{have === STICKERS.length ? 'Ai toate abțibildurile!' : `Mai ai ${STICKERS.length - have} de găsit`}</b>
      <p>ascultă, fă povești<br />și caută surprizele</p>
      <Pen className="nb-trail" box="0 0 78 28" d={TRAIL} />
    </div>
  ) })

  const aside = (i: number, goTo: (k: number) => void) => (
    <>
      <div className="nb-rings" aria-hidden="true">{Array.from({ length: 13 }, (_, k) => <i key={k} />)}</div>
      <div className="nb-tabs">
        {STICKER_GROUPS.map((g) => {
          const first = firstOf(g)
          const on = pages[i]?.label === g
          return <button type="button" key={g} style={{ '--chap': CHAPTERS[g].tape } as React.CSSProperties} aria-current={on} aria-label={`Capitolul ${g}`} onClick={() => goTo(first)}>{CHAPTERS[g].short}</button>
        })}
      </div>
    </>
  )

  return (
    <section className="bd-album-page" ref={holder}>
      <div className="bd-album-top">
        {/* Back to where the sticker was earned (named), or the usual round arrow. */}
        {backLabel ? <BackPill label={backLabel} onClick={back} /> : !kid && <button type="button" className="night-btn bd-album-back" aria-label="Înapoi" onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>}
        <h1 className="bd-album-title">Albumul meu</h1>
      </div>
      <Flipbook ref={book} pages={pages} start={start} label="Albumul cu abțibilduri" className="nb" edges={['#3a416e', '#1b2040']} aside={aside} />
      {kid ? <Link to="/povesti/acasa" className="bd-kbtn soft">Înapoi la povești</Link>
        : <p className="bd-album-note">Glisează sau atinge marginea paginii ca să răsfoiești. Atinge un loc gol ca să afli ce lipsește.</p>}
      {open && <BadgeSheet b={open} onClose={() => setOpen(undefined)} />}
    </section>
  )
}

/** The round button on the stories home that opens the album, with the newest sticker on it. */
export function AlbumButton() {
  const state = useBadges()
  const seen = new Set(state.seen)
  const earned = STICKERS.filter((b) => state.earned[b.id]).sort((a, b) => state.earned[b.id].localeCompare(state.earned[a.id]))
  const waiting = earned.some((b) => !seen.has(b.id))
  const shown = earned[0] ?? STICKERS[0]
  return (
    <Link to="/povesti/album" className="bd-album-btn" aria-label={waiting ? 'Albumul meu: ai un abțibild de lipit' : 'Albumul meu'}>
      <BadgeArt b={shown} earned={earned[0] ? state.earned[shown.id] : undefined} />
      {waiting && <span className="bd-dot" aria-hidden="true" />}
    </Link>
  )
}

/** Profile: the two collections, with the latest three of each. */
export function BadgeCards() {
  const state = useBadges()
  const latest = (list: Badge[]) => list.filter((b) => state.earned[b.id]).sort((a, b) => state.earned[b.id].localeCompare(state.earned[a.id])).slice(0, 3)
  const stamps = latest(STAMPS), stickers = latest(STICKERS)
  const nStamps = STAMPS.filter((b) => state.earned[b.id]).length
  const nStickers = STICKERS.filter((b) => state.earned[b.id]).length
  return (
    <div className="bd-cards">
      <Link to="/profil/clasor" className="bd-card">
        <span className="bd-card-head"><b>Pașaportul culinar</b><small>{nStamps} din {STAMPS.length}</small></span>
        <span className="bd-bar"><i style={{ width: `${Math.round((nStamps / STAMPS.length) * 100)}%` }} /></span>
        <span className="bd-card-row">{stamps.length ? stamps.map((b) => <BadgeArt key={b.id} b={b} plain />) : <small>Primul timbru vine cu prima rețetă.</small>}</span>
      </Link>
      <Link to="/povesti/album" className="bd-card night">
        <span className="bd-card-head"><b>Albumul de povești</b><small>{nStickers} din {STICKERS.length}</small></span>
        <span className="bd-bar"><i style={{ width: `${Math.round((nStickers / STICKERS.length) * 100)}%` }} /></span>
        <span className="bd-card-row">{stickers.length ? stickers.map((b) => <BadgeArt key={b.id} b={b} earned={state.earned[b.id]} />) : <small>Primul abțibild vine la finalul unei povești.</small>}</span>
      </Link>
    </div>
  )
}
