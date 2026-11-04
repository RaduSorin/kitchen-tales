import { useEffect, useRef, useState } from 'react'
import { SHELF_VIEWS, VIEW_LABEL, type ShelfView } from '../lib/shelf'

const ICON: Record<ShelfView, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  list: <><rect x="3" y="4" width="6" height="6" rx="1.5" /><rect x="3" y="14" width="6" height="6" rx="1.5" /><rect x="11" y="5.5" width="10" height="3" rx="1.5" /><rect x="11" y="15.5" width="10" height="3" rx="1.5" /></>,
  shelf: <><rect x="3" y="5" width="4" height="13" rx="1" /><rect x="8" y="3" width="4" height="15" rx="1" /><rect x="13" y="6" width="3.5" height="12" rx="1" /><rect x="17.2" y="4.5" width="3.8" height="13.5" rx="1" transform="rotate(8 19 11)" /><rect x="2" y="19.5" width="20" height="2" rx="1" /></>,
  flow: <><path d="M2 7l4 1.5v7L2 17z" /><rect x="7.5" y="5" width="9" height="12" rx="1.5" /><path d="M22 7l-4 1.5v7l4 1.5z" /><rect x="7.5" y="19" width="9" height="1.6" rx=".8" opacity=".45" /></>,
}

const Icon = ({ v }: { v: ShelfView }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{ICON[v]}</svg>

/** How long the opened switch stays open after the last tap. */
const OPEN_MS = 3000

/**
 * Squares, list, bookshelf or Cover Flow for the open folder. With `collapsible` it is a single
 * round button showing the current view: a tap opens the four choices to the left (over the search
 * box, so nothing moves), and it folds back 3 seconds after the last tap, or at once on a tap
 * elsewhere, on scroll, or with Escape.
 */
export default function ViewSwitch({ value, onChange, collapsible }: { value: ShelfView; onChange: (v: ShelfView) => void; collapsible?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const timer = useRef(0)
  const closeLater = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), OPEN_MS) }

  useEffect(() => {
    if (!open) return
    // Opened from the keyboard: move to the current choice.
    if (document.activeElement === toggle.current) wrap.current?.querySelector<HTMLButtonElement>('.view-switch [aria-pressed="true"]')?.focus({ preventScroll: true })
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    const scroll = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll)
    }
  }, [open])

  const pill = (
    <div className="view-switch" role="group" aria-label="Cum se văd poveștile" inert={collapsible && !open}>
      {SHELF_VIEWS.map((v) => (
        <button key={v} type="button" aria-pressed={v === value} aria-label={VIEW_LABEL[v]} title={VIEW_LABEL[v]}
          onClick={() => { onChange(v); if (collapsible) closeLater() }}>
          <Icon v={v} />
        </button>
      ))}
    </div>
  )
  if (!collapsible) return pill
  return (
    <div className={`view-switch-wrap${open ? ' open' : ''}`} ref={wrap}>
      <button type="button" ref={toggle} className="view-toggle" aria-expanded={open} tabIndex={open ? -1 : 0}
        aria-label={`Cum se văd poveștile: ${VIEW_LABEL[value]}. Schimbă`} title="Cum se văd poveștile"
        onClick={() => { setOpen(true); closeLater() }}>
        <Icon v={value} />
      </button>
      {pill}
    </div>
  )
}
