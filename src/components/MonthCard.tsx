import { useEffect, useState } from 'react'
import '../ragaz.css'
import { Link } from 'react-router-dom'
import { getLocal, loadVault, useVault } from '../lib/mind/vault'
import { dayName, monthName, nextFriday, today } from '../lib/mind/model'
import { useKid } from '../lib/kidMode'

/**
 * Răgaz on the home screen, only for an account that turned it on here. It shows nothing the
 * person wrote (the vault is locked here): just the next Friday, and whether its month is planned
 * and has a theme that evening (dates kept unencrypted on this phone, see VaultLocal.planned).
 */
export default function MonthCard() {
  const vault = useVault()
  const kid = useKid().active
  const [planned, setPlanned] = useState<Record<string, string[]>>()
  useEffect(() => { loadVault() }, [])
  useEffect(() => { if (vault.status !== 'none' && vault.status !== 'loading') getLocal().then((l) => setPlanned(l.planned), () => {}) }, [vault.status])
  if (kid || vault.status === 'none' || vault.status === 'loading') return null
  const fri = nextFriday()
  const month = fri.slice(0, 7)
  // Unknown (a plan from before this was kept): the plain line.
  const text = !planned ? (fri === today() ? 'Azi e vineri: tema ta te așteaptă' : `Următoarea temă: vineri, ${dayName(fri)}`)
    : !planned[month] ? `Planifică ${monthName(month)}: intenția și temele de vineri`
    : !planned[month].includes(fri) ? `Vineri, ${dayName(fri)}: seară liberă`
    : fri === today() ? 'Azi e vineri: tema ta te așteaptă' : `Următoarea temă: vineri, ${dayName(fri)}`
  const to = planned && !planned[month] ? `/ragaz/planifica?luna=${month}` : '/ragaz'
  return (
    <Link to={to} className="month-card">
      <span className="month-card-ic" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      </span>
      <span className="month-card-text">
        <small>Răgaz</small>
        <b>{text}</b>
      </span>
      <span className="month-card-go" aria-hidden="true">›</span>
    </Link>
  )
}
