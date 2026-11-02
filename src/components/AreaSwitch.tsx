import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

/**
 * Two-way switch between the two halves of the app: recipes and stories.
 * A bubble slides to the side you are on; each side reopens where you left it.
 */
export default function AreaSwitch() {
  const { pathname, search } = useLocation()
  const night = pathname.startsWith('/povesti')
  const nav = useNavigate()
  const last = useRef({ day: '/', night: '/povesti' })
  const go = (side: 'day' | 'night') => (e: React.MouseEvent) => {
    // Tapping the side you're on goes to its start; the other side reopens where you left it.
    e.preventDefault()
    if ((side === 'night') === night) nav(night ? '/povesti' : '/')
    else nav(last.current[side])
  }
  useEffect(() => {
    // Settings and the story player are not good places to come back to.
    if (pathname.startsWith('/setari')) return
    if (night) { if (!/^\/povesti\/(?!adauga)[^/]+$/.test(pathname)) last.current.night = pathname + search }
    else last.current.day = pathname + search
  }, [pathname, search, night])
  return (
    <div className={`area-switch${night ? ' night' : ''}`} role="group" aria-label="Alege: rețete sau povești">
      <span className="area-thumb" aria-hidden="true" />
      <Link to="/" onClick={go('day')} aria-current={!night ? 'page' : undefined} className={!night ? 'on' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11h18M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5" /></svg>
        Rețete
      </Link>
      <Link to="/povesti" onClick={go('night')} aria-current={night ? 'page' : undefined} className={night ? 'on' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
        Povești
      </Link>
    </div>
  )
}
