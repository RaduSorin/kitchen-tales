import { SHELF_VIEWS, type ShelfView } from '../lib/shelf'
import { ViewIcon } from './ViewSwitch'
import PopMenu, { MENU_ICON, MenuRow } from './PopMenu'

const SHORT: Record<ShelfView, string> = { grid: 'Pătrate', list: 'Listă', shelf: 'Raft', flow: 'Cover Flow' }

/**
 * The folder's ⋯ menu (design "Seară de lux"): a small card under the button with the four
 * views as tiles, then sharing, saving for offline and renaming. Each item is shown only when it
 * applies.
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
  const then = (fn: () => void) => () => { onClose(); fn() }
  return (
    <PopMenu label="Opțiuni folder" onClose={onClose}>
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
      {onShare && <MenuRow icon={MENU_ICON.share} onClick={then(onShare)}>Partajează folderul</MenuRow>}
      {offline && (offline.missing === 0
        ? <MenuRow icon={MENU_ICON.check}>Merge și fără internet</MenuRow>
        : offline.progress
          ? <MenuRow><span><span className="spinner" /> {offline.progress}</span></MenuRow>
          // Saving keeps the menu open, so the progress shows here.
          : <MenuRow icon={MENU_ICON.down} onClick={offline.save}>Salvează pentru offline ({offline.missing})</MenuRow>)}
      {onRename && <MenuRow icon={MENU_ICON.pen} onClick={then(onRename)}>Redenumește</MenuRow>}
    </PopMenu>
  )
}
