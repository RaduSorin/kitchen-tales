import { useEffect } from 'react'
import '../ragaz.css'
import { Link } from 'react-router-dom'
import { loadVault, useVault } from '../lib/mind/vault'
import { dayName, nextFriday, today } from '../lib/mind/model'
import { useKid } from '../lib/kidMode'

/**
 * Răgaz on the home screen, only for an account that turned it on here. It shows nothing the
 * person wrote (the vault is locked here): just the next Friday. The tap asks for Face ID.
 */
export default function MonthCard() {
  const vault = useVault()
  const kid = useKid().active
  useEffect(() => { loadVault() }, [])
  if (kid || vault.status === 'none' || vault.status === 'loading') return null
  const fri = nextFriday()
  return (
    <Link to="/ragaz" className="month-card">
      <span className="month-card-ic" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      </span>
      <span className="month-card-text">
        <small>Răgaz</small>
        <b>{fri === today() ? 'Azi e vineri: tema ta te așteaptă' : `Următoarea temă: vineri, ${dayName(fri)}`}</b>
      </span>
      <span className="month-card-go" aria-hidden="true">›</span>
    </Link>
  )
}
