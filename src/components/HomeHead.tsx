import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AreaSwitch from './AreaSwitch'
import { primeKeyboard } from '../lib/keyboard'

/**
 * The top of the two Acasă screens (design "Seară de lux"): the small Rețete / Povești switch on
 * the left and a round search button on the right, sitting on the page itself. Phones have no
 * top bar, so this is the only place the switch lives there.
 */
export default function HomeHead({ search, label, field, extra }: { search: string; label: string; field: string; extra?: ReactNode }) {
  return (
    <div className="home-head">
      <AreaSwitch />
      <span className="home-head-end">
        {extra}
        <Link to={search} className="home-search" aria-label={label} onClick={() => primeKeyboard(field)}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </Link>
      </span>
    </div>
  )
}
