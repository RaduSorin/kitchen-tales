import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react'

/**
 * A panel that slides up from the bottom (centered dialog on wide screens). With `grab` it looks
 * like an iOS sheet: a grabber at the top, a frosted dark panel, and it can be pulled down to close.
 */
export default function Sheet({ title, onClose, children, grab }: { title: string; onClose: () => void; children: ReactNode; grab?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  // Pull to close: only from the top of the sheet's content, so scrolling a long sheet still works.
  const panel = useRef<HTMLDivElement>(null)
  const pull = useRef<{ y: number; dy: number }>(undefined)
  const onTouchStart = (e: TouchEvent) => { if (grab && (panel.current?.scrollTop ?? 0) <= 0) pull.current = { y: e.touches[0].clientY, dy: 0 } }
  const onTouchMove = (e: TouchEvent) => {
    const p = pull.current, el = panel.current
    if (!p || !el) return
    p.dy = Math.max(0, e.touches[0].clientY - p.y)
    el.style.transition = 'none'
    el.style.transform = p.dy ? `translateY(${p.dy}px)` : ''
  }
  const onTouchEnd = () => {
    const p = pull.current, el = panel.current
    pull.current = undefined
    if (!p || !el) return
    el.style.transition = 'transform .2s ease-out'
    if (p.dy > Math.min(120, el.offsetHeight / 4)) { el.style.transform = 'translateY(100%)'; setTimeout(onClose, 180) }
    else el.style.transform = ''
  }

  return (
    <div className={`sheet-backdrop${grab ? ' sheet-ios' : ''}`} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel} onClick={(e) => e.stopPropagation()}
        onTouchStart={grab ? onTouchStart : undefined} onTouchMove={grab ? onTouchMove : undefined} onTouchEnd={grab ? onTouchEnd : undefined} onTouchCancel={grab ? onTouchEnd : undefined}>
        {grab && <div className="sheet-grab" aria-hidden="true" />}
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Închide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
