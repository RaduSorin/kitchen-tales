import { SHELF_VIEWS, VIEW_LABEL, type ShelfView } from '../lib/shelf'

const ICON: Record<ShelfView, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  list: <><rect x="3" y="4" width="6" height="6" rx="1.5" /><rect x="3" y="14" width="6" height="6" rx="1.5" /><rect x="11" y="5.5" width="10" height="3" rx="1.5" /><rect x="11" y="15.5" width="10" height="3" rx="1.5" /></>,
  shelf: <><rect x="3" y="5" width="4" height="13" rx="1" /><rect x="8" y="3" width="4" height="15" rx="1" /><rect x="13" y="6" width="3.5" height="12" rx="1" /><rect x="17.2" y="4.5" width="3.8" height="13.5" rx="1" transform="rotate(8 19 11)" /><rect x="2" y="19.5" width="20" height="2" rx="1" /></>,
  flow: <><path d="M2 7l4 1.5v7L2 17z" /><rect x="7.5" y="5" width="9" height="12" rx="1.5" /><path d="M22 7l-4 1.5v7l4 1.5z" /><rect x="7.5" y="19" width="9" height="1.6" rx=".8" opacity=".45" /></>,
}

/** Squares, list, bookshelf or Cover Flow for the open folder. */
export default function ViewSwitch({ value, onChange }: { value: ShelfView; onChange: (v: ShelfView) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="Cum se văd poveștile">
      {SHELF_VIEWS.map((v) => (
        <button key={v} type="button" aria-pressed={v === value} aria-label={VIEW_LABEL[v]} title={VIEW_LABEL[v]} onClick={() => onChange(v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{ICON[v]}</svg>
        </button>
      ))}
    </div>
  )
}
