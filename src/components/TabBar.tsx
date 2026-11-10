import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
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
 * A tab icon, drawn like the icons in the 2026-11 redesign concepts: thin rounded outlines on a
 * 24px grid. The open tab shows the same outline, dark inside the gold bubble.
 */
const I = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const HOME = 'M4 11.5 12 4.5l8 7V20h-5.5v-5h-5v5H4z'
const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4'

// Search is not a tab: the recipe list, the shelf and both home screens have a search box.
const TABS: { to: string; label: string; full?: string; end?: boolean; icon: string }[] = [
  { to: '/', label: 'Acasă', end: true, icon: HOME },
  // A calendar page.
  { to: '/saptamana', label: 'Săptămâna', full: 'Săptămâna mea', icon: 'M7 5.5h10a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8.5a3 3 0 0 1 3-3zM4 10h16M8.5 3.5V7M15.5 3.5V7' },
  // A steaming pot.
  { to: '/retete', label: 'Rețete', full: 'Rețetele mele', icon: 'M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM2 10h20M9 6.5c0-1 1-1.5 1-2.5M13.5 6.5c0-1 1-1.5 1-2.5' },
  { to: '/cumparaturi', label: 'Listă', full: 'Cumpărături', icon: 'M3 4.5h2.5l2 10.5h10l2-7.5H7M9 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM16.5 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z' },
]

/** The last tab on both sides: the account, its settings, the child, sharing. */
const ProfileTab = () => (
  <NavLink to="/profil" className="tab tab-profile" aria-label="Profil și setări">
    <span className="tab-icon"><I d={PROFILE} /></span><span className="tab-label">Profil</span>
  </NavLink>
)

// Three books on a shelf, the last one leaning.
const SHELF = 'M5 4v16M9 4v16M13.5 5.5l4.5 14'
const PLUS = 'M12 5v14M5 12h14'
const SPARKLE = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'
const HEART = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'
/** A head and shoulders: the account. */
export const PROFILE = 'M12 4.7a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5'

/**
 * Hidden in full-screen cooking, on a recipe, on the story player (it has its own big controls) and while
 * adding or editing something: there the page's own button takes the bottom of the screen, and
 * the tabs would only invite leaving halfway. The "Poveste nouă" choice itself is a tab, so the
 * bar goes only once a way to add is picked (?mod=).
 */
/** A recipe is a full-screen page: its own "Începe să gătești" bar takes the bottom of the screen. */
const isRecipePage = (path: string) => /^\/retete\/[^/]+$/.test(path) && path !== '/retete/noua'

const hidesTabBar = (path: string, search: string) =>
  path.endsWith('/gateste') || isPlayerPage(path) || isRecipePage(path)
  || path === '/retete/noua' || path.endsWith('/editeaza') || path === '/saptamana/planifica' || path === '/ragaz/incepe' || path === '/ragaz/planifica' || path === '/ragaz/griji'
  || (path === '/povesti/adauga' && new URLSearchParams(search).has('mod'))


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
  const hidden = hidesTabBar(pathname, search)
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
