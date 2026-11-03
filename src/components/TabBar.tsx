import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { listStories } from '../lib/db'
import { getLastStoryId } from '../lib/stories'
import { useSyncedList } from '../lib/synced'
import { shoppingStore } from '../lib/plan'
import { isPlayerPage, useArea } from '../lib/area'
import { mergeShopping } from '../lib/merge'
import { primeKeyboard } from '../lib/keyboard'
import { useKid } from '../lib/kidMode'

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

const HOME = TABS[0].icon
const SEARCH = TABS[1].icon
const SHELF = 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.2l3.8-1 3.7 15.5-3.8 1z'
const PLUS = 'M12 5v14M5 12h14'
const SPARKLE = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'
const HEART = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'

/** Hidden in full-screen cooking and on the story player, which has its own big controls. */
const hidesTabBar = (path: string) => path.endsWith('/gateste') || isPlayerPage(path)

/** The stories side: Acasă, Caută, Bibliotecă (big, in the middle), Adaugă, Favorite. */
function StoryTabs() {
  const { pathname, search } = useLocation()
  const q = new URLSearchParams(search)
  const onShelf = pathname === '/povesti'
  const searching = onShelf && q.has('cauta')
  const favorites = onShelf && q.has('favorite')
  const shelf = onShelf && !searching && !favorites
  // Kid mode: nothing to add, record or create.
  const kid = useKid().active
  const nav = useNavigate()
  // Kid mode swaps "Adaugă" for "Surpriză": a random story (not the last one) starts playing.
  const surprise = async () => {
    const all = await listStories().catch(() => [])
    const pool = all.length > 1 ? all.filter((s) => s.id !== getLastStoryId()) : all
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick) nav(`/povesti/${pick.id}`, { state: { autoplay: true } })
  }
  return (
    <>
      <div className="tabbar-spacer" aria-hidden="true" />
      <nav className="tabbar night-tabbar" aria-label="Meniu povești">
        <NavLink to="/povesti/acasa" className="tab"><span className="tab-icon"><I d={HOME} /></span><span className="tab-label">Acasă</span></NavLink>
        <Link to="/povesti?cauta=1" onClick={() => primeKeyboard('story-search')} className={`tab${searching ? ' active' : ''}`} aria-current={searching ? 'page' : undefined}>
          <span className="tab-icon"><I d={SEARCH} /></span><span className="tab-label">Caută</span>
        </Link>
        <Link to="/povesti" className={`tab tab-center${shelf ? ' active' : ''}`} aria-current={shelf ? 'page' : undefined}>
          <span className="tab-icon"><I d={SHELF} /></span><span className="tab-label">Bibliotecă</span>
        </Link>
        {kid
          ? <button type="button" className="tab tab-surprise" onClick={surprise}><span className="tab-icon"><I d={SPARKLE} /></span><span className="tab-label">Surpriză</span></button>
          : <NavLink to="/povesti/adauga" className="tab"><span className="tab-icon"><I d={PLUS} /></span><span className="tab-label">Adaugă</span></NavLink>}
        <Link to="/povesti?favorite=1" className={`tab${favorites ? ' active' : ''}`} aria-current={favorites ? 'page' : undefined}>
          <span className="tab-icon"><I d={HEART} /></span><span className="tab-label">Favorite</span>
        </Link>
      </nav>
    </>
  )
}

/** Phone-style navigation. On wide screens the same links are in the top bar. */
/** True for fields that bring up the on-screen keyboard (not checkboxes, buttons, sliders...). */
function opensKeyboard(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'image'].includes(el.type)
  return false
}

/**
 * iOS keeps fixed elements above the keyboard, so the floating bars would sit on top of the
 * field being typed in. While the keyboard is up we mark <html> with data-typing and the CSS
 * hides the tab bar and mini player.
 *
 * A focused field alone is not enough: iOS does not open the keyboard when a page focuses a
 * field by itself (the stories "Caută" tab does), and hiding the bars then leaves the screen
 * with no navigation. Where the browser reports the visual viewport, we wait until it really
 * shrinks for the keyboard.
 */
function useTypingFlag() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    // The viewport height with no keyboard, remembered while no text field has focus
    // (window.innerHeight is not reliable for this on iOS).
    let full = vv?.height ?? 0
    const update = () => {
      const field = opensKeyboard(document.activeElement)
      if (vv && !field) full = vv.height
      if (field && (!vv || vv.height < full - 120)) root.dataset.typing = ''
      else delete root.dataset.typing
    }
    // Focus may move straight to another field; check after it settles.
    const later = () => setTimeout(update, 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', later)
    vv?.addEventListener('resize', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', later)
      vv?.removeEventListener('resize', update)
      delete root.dataset.typing
    }
  }, [])
}

export default function TabBar() {
  const { pathname } = useLocation()
  const hidden = hidesTabBar(pathname)
  const stories = useArea() === 'night'
  const shopping = useSyncedList(shoppingStore)
  const toBuy = mergeShopping(shopping.filter((s) => !s.checked)).length
  useTypingFlag()
  useEffect(() => {
    if (hidden) delete document.documentElement.dataset.tabbar
    else document.documentElement.dataset.tabbar = ''
  }, [hidden])
  if (hidden) return null
  if (stories) return <StoryTabs />
  return (
    <>
      <div className="tabbar-spacer" aria-hidden="true" />
      <nav className="tabbar" aria-label="Meniu">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} onClick={t.to === '/cauta' ? () => primeKeyboard('search-input') : undefined} className={t.to === '/retete' ? 'tab tab-center' : 'tab'} aria-label={t.full}>
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
