import { useEffect, useSyncExternalStore } from 'react'
import { currentToast, hideToast, subscribeToast } from '../lib/toast'

/** Shows the latest toast above the tab bar; it goes away by itself after a few seconds. */
export default function ToastHost() {
  const t = useSyncExternalStore(subscribeToast, currentToast)
  useEffect(() => {
    if (!t) return
    const h = setTimeout(() => hideToast(t.id), t.ms ?? (t.undo ? 5000 : 3000))
    return () => clearTimeout(h)
  }, [t])
  if (!t) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{t.text}</span>
      {t.undo && <button type="button" onClick={() => { t.undo!(); hideToast(t.id) }}>{t.label ?? 'Anulează'}</button>}
    </div>
  )
}
