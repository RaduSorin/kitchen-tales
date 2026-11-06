import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { listStories } from '../lib/db'
import { getLastStoryId } from '../lib/stories'
import { useSyncedList } from '../lib/synced'
import { shoppingStore } from '../lib/plan'
import { isPlayerPage, useArea } from '../lib/area'
import { mergeShopping } from '../lib/merge'
import { primeKeyboard } from '../lib/keyboard'
import { useKid } from '../lib/kidMode'

/**
 * A tab icon: the outline, and a solid version shown while the tab is open (design "Seară de
 * lux": a solid dark glyph inside the gold bubble). Details cut out of a solid glyph are drawn
 * in the bubble's colour.
 */
const I = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path className="ic-line" d={d} />
    <g className="ic-fill">{SOLID[d] ?? <path d={d} fill="currentColor" />}</g>
  </svg>
)
const CUT = 'var(--accent)'

const HOME = 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'
const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4'

// Search is not a tab: the recipe list, the shelf and both home screens have a search box.
const TABS: { to: string; label: string; full?: string; end?: boolean; icon: string }[] = [
  { to: '/', label: 'Acasă', end: true, icon: HOME },
  { to: '/saptamana', label: 'Săptămâna', full: 'Săptămâna mea', icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4M8 14h2M14 14h2M8 17h2' },
  { to: '/retete', label: 'Rețete', full: 'Rețetele mele', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6' },
  { to: '/cumparaturi', label: 'Listă', full: 'Cumpărături', icon: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20.5h.01M17 20.5h.01' },
]

/** The last tab on both sides: the account, its settings, the child, sharing. */
const ProfileTab = () => (
  <NavLink to="/profil" className="tab tab-profile" aria-label="Profil și setări">
    <span className="tab-icon"><I d={PROFILE} /></span><span className="tab-label">Profil</span>
  </NavLink>
)

const SHELF = 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.2l3.8-1 3.7 15.5-3.8 1z'
const PLUS = 'M12 5v14M5 12h14'
const SPARKLE = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'
// Fills the 24px box like the other icons (the old heart sat in the lower half and looked small).
const HEART = 'M12 21s-9-5.4-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.6-9 12-9 12z'
/** Person in a circle: the account, drawn like the other outline icons. */
export const PROFILE = 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM12 7a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 12 7zM6.2 18.6a7 7 0 0 1 11.6 0'

const CAL = TABS[1].icon, BOOK = TABS[2].icon, CART = TABS[3].icon
/** Solid versions of the outline icons (the rest are simply filled in). */
const SOLID: Record<string, ReactNode> = {
  [HOME]: <path d="M12 2.6 2.6 10.4V20a1.4 1.4 0 0 0 1.4 1.4h5.2v-6.2h5.6v6.2H20a1.4 1.4 0 0 0 1.4-1.4v-9.6z" fill="currentColor" strokeWidth="1.2" />,
  [CAL]: <><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" /><path d="M8 2v4M16 2v4" /><path d="M4 10h16M8 14h2M14 14h2M8 17h2" stroke={CUT} /></>,
  [BOOK]: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" fill="currentColor" /><path d="M7.4 17.6a1.6 1.6 0 0 1 1.4-1.2H19M9 8h6" stroke={CUT} /></>,
  [CART]: <><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2z" fill="currentColor" /><circle cx="9.5" cy="20.5" r="1.6" fill="currentColor" stroke="none" /><circle cx="17" cy="20.5" r="1.6" fill="currentColor" stroke="none" /></>,
  [PROFILE]: <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><circle cx="12" cy="10.2" r="3.3" fill={CUT} stroke="none" /><path d="M6.4 18.4a7 7 0 0 1 11.2 0" stroke={CUT} strokeWidth="2.6" /></>,
  [SHELF]: <path d={SHELF} fill="currentColor" strokeWidth="1" />,
  [PLUS]: <path d={PLUS} strokeWidth="2.8" />,
  [SEARCH]: <path d={SEARCH} strokeWidth="2.8" />,
}

/** Hidden in full-screen cooking and on the story player, which has its own big controls. */
const hidesTabBar = (path: string) => path.endsWith('/gateste') || isPlayerPage(path)


/**
 * The gold bubble behind the open tab is one element that slides from tab to tab (instead of
 * each tab painting its own). It follows the `.tab.active` link, also when the bar resizes; with
 * no open tab (e.g. a page that isn't a tab) it fades out where it was.
 */
function useTabBubble(key: string) {
  const bar = useRef<HTMLElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number; on: boolean }>()
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const place = () => {
      const tab = el.querySelector<HTMLElement>('.tab.active')
      if (tab) setPos({ x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight, on: true })
      else setPos((p) => p && { ...p, on: false })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [key])
  // No slide on the first placement, only between tabs.
  useEffect(() => { if (pos && !ready) requestAnimationFrame(() => setReady(true)) }, [pos, ready])
  const style = pos && ({ width: pos.w, height: pos.h, transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: pos.on ? 1 : 0 } as CSSProperties)
  return { bar, bubble: <span className={`tab-bubble${ready ? ' ready' : ''}`} style={style} aria-hidden="true" /> }
}

/** The stories side: Acasă, Favorite, Bibliotecă, Adaugă, Profil. The open one is a filled bubble. */
function StoryTabs() {
  const { pathname, search } = useLocation()
  const { bar, bubble } = useTabBubble(pathname + search)
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
      <nav className="tabbar night-tabbar" aria-label="Meniu povești" ref={bar}>
        {bubble}
        <NavLink to="/povesti/acasa" className="tab"><span className="tab-icon"><I d={HOME} /></span><span className="tab-label">Acasă</span></NavLink>
        <Link to="/povesti?favorite=1" className={`tab${favorites ? ' active' : ''}`} aria-current={favorites ? 'page' : undefined}>
          <span className="tab-icon"><I d={HEART} /></span><span className="tab-label">Favorite</span>
        </Link>
        <Link to="/povesti" className={`tab${shelf ? ' active' : ''}`} aria-current={shelf ? 'page' : undefined}>
          <span className="tab-icon"><I d={SHELF} /></span><span className="tab-label">Bibliotecă</span>
        </Link>
        {kid
          ? <button type="button" className="tab tab-surprise" onClick={surprise}><span className="tab-icon"><I d={SPARKLE} /></span><span className="tab-label">Surpriză</span></button>
          : <NavLink to="/povesti/adauga" className="tab"><span className="tab-icon"><I d={PLUS} /></span><span className="tab-label">Adaugă</span></NavLink>}
        {/* Kid mode has no Profile (settings stay behind the PIN): the child gets Caută there instead. */}
        {kid
          ? <Link to="/povesti?cauta=1" onClick={() => primeKeyboard('story-search')} className={`tab${searching ? ' active' : ''}`} aria-current={searching ? 'page' : undefined}>
              <span className="tab-icon"><I d={SEARCH} /></span><span className="tab-label">Caută</span>
            </Link>
          : <ProfileTab />}
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
  const { pathname, search } = useLocation()
  const { bar, bubble } = useTabBubble(pathname + search)
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
      <nav className="tabbar" aria-label="Meniu" ref={bar}>
        {bubble}
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab" aria-label={t.full}>
            <span className="tab-icon">
              <I d={t.icon} />
              {t.to === '/cumparaturi' && toBuy > 0 && <span className="tab-badge">{toBuy > 99 ? '99+' : toBuy}</span>}
            </span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
        <ProfileTab />
      </nav>
    </>
  )
}
