import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The top of both Acasă screens (design "Vitrina"): a picture as wide as the screen running up under
 * the clock, the title and buttons over its lower part, and up to three of them to swipe between.
 * Recipes show the dish photo cut to fill; stories show the whole square cover and, below it, the
 * cover blurred into a glow (`blur`).
 */
export type VitrineSlide = {
  id: string
  /** The picture: a recipe photo or a story cover. */
  art: ReactNode
  /** Stories: the same cover again, blurred behind everything. */
  blur?: ReactNode
  kicker: string
  title: string
  /** Where the picture and the title lead. */
  href: string
  meta?: string
  /** 0..1, drawn as a gold bar (a story half listened). */
  progress?: number
  action: string
  actionTo: string
  actionState?: unknown
  /** The gold button's icon (▶ by default, for stories). */
  actionIcon?: ReactNode
  /** The second button, next to the gold one. */
  side?: ReactNode
}

const Play = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>

export default function Vitrine({ slides, active, onActive, head, label, cover }: {
  slides: VitrineSlide[]
  active: number
  onActive: (i: number) => void
  /** The switch and the search button (or the kid-mode corner), floating on the picture. */
  head: ReactNode
  label: string
  /** Stories: square covers shown whole. */
  cover?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const onScroll = () => {
    const el = track.current
    if (!el) return
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth)))
    if (i !== active) onActive(i)
  }
  const go = (i: number) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })
  return (
    <section className={cover ? 'vt-hero vt-cover' : 'vt-hero'} aria-roledescription="carusel" aria-label={label}>
      <div className="vt-track" ref={track} onScroll={onScroll}>
        {slides.map((s, i) => (
          <div className="vt-slide" key={s.id} aria-hidden={i !== active}>
            {s.blur && <span className="vt-blur" aria-hidden="true">{s.blur}</span>}
            <Link to={s.href} className="vt-photo" tabIndex={-1} aria-hidden="true">{s.art}</Link>
            <div className="vt-text">
              <small className="sa-kicker">{s.kicker}</small>
              <h2 className="vt-title"><Link to={s.href}>{s.title}</Link></h2>
              {s.meta && <small className="vt-meta">{s.meta}</small>}
              {s.progress !== undefined && <span className="vt-progress"><i style={{ width: `${Math.round(s.progress * 100)}%` }} /></span>}
              <div className="vt-btns">
                <Link to={s.actionTo} state={s.actionState} className="vt-btn">{s.actionIcon ?? <Play />} {s.action}</Link>
                {s.side}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="vt-head">{head}</div>
      {slides.length > 1 && (
        <div className="vt-dots">
          {slides.map((s, i) => <button key={s.id} type="button" className={i === active ? 'on' : ''} aria-label={`${i + 1} din ${slides.length}`} aria-current={i === active} onClick={() => go(i)} />)}
        </div>
      )}
    </section>
  )
}
