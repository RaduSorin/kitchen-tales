import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSyncedList } from '../lib/synced'
import { shoppingStore } from '../lib/plan'

const I = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

const TABS: { to: string; label: string; full?: string; end?: boolean; icon: string }[] = [
  { to: '/', label: 'Acasă', end: true, icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { to: '/cauta', label: 'Caută', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4' },
  { to: '/retete', label: 'Rețete', full: 'Rețetele mele', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6' },
  { to: '/saptamana', label: 'Săptămâna', full: 'Săptămâna mea', icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4M8 14h2M14 14h2M8 17h2' },
  { to: '/cumparaturi', label: 'Cumpărături', icon: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20.5h.01M17 20.5h.01' },
]

/** Where the bottom tab bar is hidden: the kids' stories area and full-screen cooking. */
const hidesTabBar = (path: string) => path.startsWith('/povesti') || path.endsWith('/gateste')

/** Phone-style navigation for the recipes side. On wide screens the same links are in the top bar. */
export default function TabBar() {
  const { pathname } = useLocation()
  const hidden = hidesTabBar(pathname)
  const shopping = useSyncedList(shoppingStore)
  const toBuy = shopping.filter((s) => !s.checked).length
  useEffect(() => {
    if (hidden) delete document.documentElement.dataset.tabbar
    else document.documentElement.dataset.tabbar = ''
  }, [hidden])
  if (hidden) return null
  return (
    <>
      <div className="tabbar-spacer" aria-hidden="true" />
      <nav className="tabbar" aria-label="Meniu">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab" aria-label={t.full}>
            <span className="tab-icon">
              <I d={t.icon} />
              {t.to === '/cumparaturi' && toBuy > 0 && <span className="tab-badge">{toBuy > 99 ? '99+' : toBuy}</span>}
            </span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
