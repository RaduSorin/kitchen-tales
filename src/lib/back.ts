import { useNavigate } from 'react-router-dom'

/** True when there is an earlier page of this app in the history (React Router counts entries in history.state.idx). */
export const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0

/**
 * "Back" that never leaves the app: the home-screen app has no browser bar, so when the page
 * was opened directly (a link, a reload) there is nothing to go back to and we open `fallback`.
 */
export function useBack(fallback: string) {
  const nav = useNavigate()
  return () => { if (canGoBack()) nav(-1); else nav(fallback, { replace: true }) }
}
