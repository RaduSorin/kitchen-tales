// Stamps and stickers on screen: the drawings, the moment one is earned ("Timbru nou" with the
// postmark, or "Ura!" with the sticker to stick), the Clasor (Profile) and the Album (stories).
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Sheet from './Sheet'
import { BADGE, STAMPS, STAMP_GROUPS, STICKERS, type Badge } from '../lib/badges/catalog'
import { plainStampSvg, stampSvg, stickerSvg } from '../lib/badges/art'
import { progressOf } from '../lib/badges/engine'
import { markSeen, putOff, startBadges, useBadges, usePendingBadges } from '../lib/badges/store'
import { useBack } from '../lib/back'
import { useKid } from '../lib/kidMode'
import '../badges.css'

const romanDay = (iso: string) => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')

/** The drawing of a badge: a stamp (with its postmark once earned) or a sticker. */
export function BadgeArt({ b, earned, wide, plain, className }: { b: Badge; earned?: string; wide?: boolean; plain?: boolean; className?: string }) {
  const html = useMemo(() => b.kind !== 'stamp' ? stickerSvg(b, !!earned)
    : plain ? plainStampSvg(b) : stampSvg(b, earned ? new Date(earned) : undefined, { wide }),
    [b, earned, wide, plain])
  return <span className={`bd-art ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

/** The four-pointed sparkles around a new sticker. */
const TWINKLES = [[8, 14, 0], [86, 22, 0.5], [14, 78, 0.9], [84, 80, 0.3], [48, 2, 1.2], [2, 48, 0.7], [94, 54, 1.4]]

/**
 * Celebrates the badges just earned, one at a time: a stamp lands and gets its postmark; a
 * sticker jumps on screen and the child taps "Lipește în album". Mounted once, in the app shell.
 */
export function BadgeCelebration() {
  const pending = usePendingBadges()
  const { pathname } = useLocation()
  const nav = useNavigate()
  // The sticker being stuck right now (its little flight into the album).
  const [stuckId, setStuckId] = useState<string>()
  useEffect(() => { startBadges() }, [])
  // Not over Răgaz (private) or the album itself (it shows the sticker waiting there).
  const quiet = pathname.startsWith('/ragaz') || pathname === '/povesti/album'
  const id = quiet ? undefined : pending[0]
  const b = id ? BADGE.get(id) : undefined
  const state = useBadges()
  if (!b) return null
  const earned = state.earned[b.id]
  const sticking = stuckId === b.id

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
          <button type="button" className="btn primary bd-btn" autoFocus onClick={() => markSeen(b.id)}>Gata</button>
          <button type="button" className="bd-link" onClick={() => { markSeen(b.id); nav('/profil/clasor') }}>Vezi clasorul</button>
        </div>
      </div>
    )
  }

  const stick = () => {
    setStuckId(b.id)
    setTimeout(() => markSeen(b.id), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650)
  }
  return (
    <div className="bd-layer bd-kid" role="dialog" aria-modal="true" aria-label={`Abțibild nou: ${b.name}`}>
      <div className="bd-ura">
        <span className="bd-ura-title">Ura!</span>
        <div className={`bd-reward${sticking ? ' sticking' : ''}`}>
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
        <button type="button" className="bd-kbtn" autoFocus disabled={sticking} onClick={stick}>Lipește în album</button>
        <button type="button" className="bd-kbtn soft" disabled={sticking} onClick={() => putOff(b.id)}>Mai târziu</button>
      </div>
    </div>
  )
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
  const progress = progressText(b, p.have, p.need)
  const series = b.lvl ? STAMPS.filter((x) => x.art === b.art) : []
  return (
    <Sheet title={hidden ? 'Surpriză' : b.name} onClose={onClose} grab>
      <div className={`bd-detail${b.kind === 'sticker' ? ' kid' : ''}`}>
        <BadgeArt b={b} earned={earned} className="bd-detail-art" />
        <b className="bd-name">{hidden ? 'Surpriză' : b.name}</b>
        <p className="bd-how">{hidden ? 'O descoperi făcând ce faci de obicei în aplicație, doar puțin altfel.' : b.how}</p>
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

/** Profile › "Clasorul meu": every stamp, earned with its postmark, missing as a dashed outline. */
export function Clasor() {
  const state = useBadges()
  const [group, setGroup] = useState<string>('')
  const [open, setOpen] = useState<Badge>()
  const now = new Date()
  const have = STAMPS.filter((b) => state.earned[b.id]).length
  const groups = STAMP_GROUPS.filter((g) => !group || g === group)
  return (
    <div className="bd-clasor">
      <p className="bd-sum">{have} {have === 1 ? 'timbru' : 'timbre'} din {STAMPS.length}</p>
      <div className="bd-bar big"><i style={{ width: `${Math.round((have / STAMPS.length) * 100)}%` }} /></div>
      <div className="chips bd-chips" role="group" aria-label="Arată">
        <button type="button" className={`chip${!group ? ' on' : ''}`} aria-pressed={!group} onClick={() => setGroup('')}>Toate</button>
        {STAMP_GROUPS.map((g) => <button type="button" key={g} className={`chip${group === g ? ' on' : ''}`} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      {groups.map((g) => (
        <section key={g} className="bd-group">
          <h2 className="set-label">{g}</h2>
          <div className="bd-grid">
            {STAMPS.filter((b) => b.group === g).map((b) => {
              const earned = state.earned[b.id]
              const p = progressOf(b, state, now)
              const hidden = b.secret && !earned
              return (
                <button type="button" key={b.id} className={`bd-cell${earned ? '' : ' off'}`} onClick={() => setOpen(b)}>
                  <BadgeArt b={b} earned={earned} />
                  <span className="bd-cell-name">{hidden ? 'Surpriză' : b.name}</span>
                  <small>{earned ? romanDay(earned) : progressText(b, p.have, p.need) || ' '}</small>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {open && <BadgeSheet b={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

/** /povesti/album: the stickers, for the child too (kid mode). Stickers waiting to be stuck glow. */
export function Album() {
  const state = useBadges()
  const kid = useKid().active
  const back = useBack('/povesti/acasa')
  const [open, setOpen] = useState<Badge>()
  const [justStuck, setJustStuck] = useState<string>()
  const seen = new Set(state.seen)
  const have = STICKERS.filter((b) => state.earned[b.id]).length
  return (
    <section className="bd-album-page">
      <div className="bd-album-top">
        {!kid && <button type="button" className="night-btn bd-album-back" aria-label="Înapoi" onClick={back}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>}
        <h1 className="bd-album-title">Albumul meu</h1>
      </div>
      <p className="bd-album-sum">{have} din {STICKERS.length}</p>
      <div className="bd-album">
        {STICKERS.map((b) => {
          const earned = state.earned[b.id]
          const waiting = !!earned && !seen.has(b.id)
          return (
            <button type="button" key={b.id} className={`bd-slot${waiting ? ' waiting' : ''}${justStuck === b.id ? ' stuck' : ''}`}
              aria-label={waiting ? `${b.name}: lipește-l în album` : earned ? b.name : 'Loc gol'}
              onClick={() => { if (waiting) { markSeen(b.id); setJustStuck(b.id) } else setOpen(b) }}>
              <BadgeArt b={b} earned={earned} />
              {waiting && <span className="bd-slot-tag">Lipește!</span>}
            </button>
          )
        })}
      </div>
      {kid ? <Link to="/povesti/acasa" className="bd-kbtn soft">Înapoi la povești</Link>
        : <p className="bd-album-note">Abțibildurile vin când ascultați sau faceți povești. Atinge un loc gol ca să afli ce lipsește.</p>}
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
        <span className="bd-card-head"><b>Clasorul de rețete</b><small>{nStamps} din {STAMPS.length}</small></span>
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
