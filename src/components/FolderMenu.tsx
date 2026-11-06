import { useEffect, useRef } from 'react'
import { SHELF_VIEWS, type ShelfView } from '../lib/shelf'
import { ViewIcon } from './ViewSwitch'

const SHORT: Record<ShelfView, string> = { grid: 'Pătrate', list: 'Listă', shelf: 'Raft', flow: 'Cover Flow' }

const Svg = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const SHARE = 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'
const DOWN = 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14'
const PEN = 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'

/**
 * The folder's ⋯ menu (design "Seară de lux"): a small card under the button with the four
 * views as tiles, then sharing, saving for offline and renaming. Each item is shown only when it
 * applies; it closes on a tap outside, on scroll or with Escape.
 */
export default function FolderMenu({ view, onView, onShare, offline, onRename, onClose }: {
  view?: ShelfView
  onView?: (v: ShelfView) => void
  onShare?: () => void
  /** Stories not saved yet (0: all are), and the progress text while saving. */
  offline?: { missing: number; progress?: string; save: () => void }
  onRename?: () => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    // The ⋯ button itself toggles the menu, so a tap on it is not "outside".
    const outside = (e: PointerEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !t.closest?.('.folder-more-wrap')) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => document.addEventListener('pointerdown', outside), 0)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', onClose, { passive: true })
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', onClose)
    }
  }, [onClose])
  const then = (fn: () => void) => () => { onClose(); fn() }
  return (
    <div className="folder-menu" ref={box} role="menu" aria-label="Opțiuni folder">
      {view && onView && (
        <>
          <small className="folder-menu-label">Vizualizare</small>
          <div className="folder-menu-views">
            {SHELF_VIEWS.map((v) => (
              <button type="button" key={v} role="menuitemradio" aria-checked={v === view} className={v === view ? 'on' : undefined} onClick={then(() => onView(v))}>
                <ViewIcon v={v} /><span>{SHORT[v]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {onShare && <button type="button" role="menuitem" className="folder-menu-row" onClick={then(onShare)}>Partajează folderul<Svg d={SHARE} /></button>}
      {offline && (offline.missing === 0
        ? <span className="folder-menu-row done">Merge și fără internet<Svg d="M5 12.5l4.5 4.5L19 7" /></span>
        : offline.progress
          ? <span className="folder-menu-row done"><span><span className="spinner" /> {offline.progress}</span></span>
          // Saving keeps the menu open, so the progress shows here.
          : <button type="button" role="menuitem" className="folder-menu-row" onClick={offline.save}>Salvează pentru offline ({offline.missing})<Svg d={DOWN} /></button>)}
      {onRename && <button type="button" role="menuitem" className="folder-menu-row" onClick={then(onRename)}>Redenumește<Svg d={PEN} /></button>}
    </div>
  )
}
