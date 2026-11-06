import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useBack } from './lib/back'
import NotFound from './pages/NotFound'
import ToastHost from './components/ToastHost'
import LeaveConfirm from './components/LeaveConfirm'
import Home from './pages/Home'
import { useOnline } from './lib/useOffline'
import { applyTheme, setStatusBarColor, useSettings } from './lib/settings'
import { useSettingsSync } from './lib/settingsSync'
import CoverGlow from './components/CoverGlow'

import RecipeList from './pages/RecipeList'
import RecipeView from './pages/RecipeView'
import RecipeEdit from './pages/RecipeEdit'
import StoryList from './pages/StoryList'
import StoryPlayer from './pages/StoryPlayer'
import StoryAdd from './pages/StoryAdd'
import Profile, { profileTitle } from './pages/Profile'
import CookMode from './pages/CookMode'
import MiniPlayer from './components/MiniPlayer'
import { NowPlayingProvider } from './lib/nowPlaying'
import TabBar, { PROFILE } from './components/TabBar'
import AreaSwitch from './components/AreaSwitch'
import { isPlayerPage, useArea } from './lib/area'
import Search from './pages/Search'
import StoriesHome from './pages/StoriesHome'
import Week from './pages/Week'
import Shopping from './pages/Shopping'
import { KidGate, KidLockButton } from './components/KidMode'
import { applyPinReset, useKid } from './lib/kidMode'

/** The stories background (also the iPhone status bar colour there). */
const NIGHT_BG = '#0f0e13'

// Both sides use the dark "Seară de lux" palette; the stories side has its own tones. Behind
// every screen glows the cover of the story in focus, or on the recipes side the dish's photo.
function NightArea() {
  const night = useArea() === 'night'
  useEffect(() => {
    const root = document.documentElement
    if (night) {
      root.dataset.area = 'night'
      setStatusBarColor(NIGHT_BG)
    } else {
      delete root.dataset.area
      applyTheme()
    }
  }, [night])
  // key: the glow starts fresh when you switch sides.
  return <CoverGlow key={night ? 'night' : 'day'} recipes={!night} />
}

/** Where the top bar's back arrow leads on pages that are not one of the main tabs (undefined: no arrow). */
function backFallback(pathname: string) {
  if (/^\/retete\/[^/]+$/.test(pathname) && pathname !== '/retete/noua') return '/retete'
  if (pathname.startsWith('/profil/')) return '/profil'
  return undefined
}

function BackButton({ to }: { to: string }) {
  const back = useBack(to)
  return (
    <button type="button" className="back-btn" onClick={back} aria-label="Înapoi">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      <span>Înapoi</span>
    </button>
  )
}

/**
 * Phones: the top bar slides away while you scroll down a page and comes back as soon as you
 * scroll up, so content gets the screen (like Safari and most iOS apps).
 */
function useHideOnScroll(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (!enabled) { delete root.dataset.topbarHidden; return }
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y < 80) delete root.dataset.topbarHidden
      else if (y > last + 6) root.dataset.topbarHidden = ''
      else if (y < last - 6) delete root.dataset.topbarHidden
      if (Math.abs(y - last) > 6 || y < 80) last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); delete root.dataset.topbarHidden }
  }, [enabled])
}

function Shell() {
  const online = useOnline()
  const { pathname } = useLocation()
  const back = backFallback(pathname)
  // The Profile is the same on both sides: its title replaces the Rețete / Povești switch.
  const profile = pathname.startsWith('/profil')
  const childName = useSettings().child.name
  const player = isPlayerPage(pathname)
  const header = useRef<HTMLElement>(null)
  const kid = useKid().active
  // The name only on the two home screens; elsewhere each page's big title says where you are.
  const home = pathname === '/' || pathname === '/povesti/acasa'
  useHideOnScroll(!player)
  // A new page starts with the bar showing.
  useEffect(() => { delete document.documentElement.dataset.topbarHidden }, [pathname])
  // Sticky bars under the top bar (e.g. the recipe editor's Save bar) need its real height,
  // which changes with the iPhone notch and the two-line name.
  useLayoutEffect(() => {
    const el = header.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [player, kid])
  useEffect(() => {
    if (player) document.documentElement.dataset.fullscreen = ''
    else delete document.documentElement.dataset.fullscreen
  }, [player])
  return (
    <>
      <NightArea />
      {!player && <div className="status-fill" aria-hidden="true" />}
      {/* Phones: no top bar (pages use the whole screen, like the design), kid mode too: there the
          lock sits in each page's top row (KidCorner). Wide screens keep the bar. */}
      {!player && <header className={`topbar topbar-wide${profile ? ' topbar-profile' : ''}`} ref={header}>
        {profile && <div className="topbar-title" aria-hidden="true">{profileTitle(pathname, childName)}</div>}
        {back && !kid ? <BackButton to={back} /> : profile ? <span /> : kid
          // Stories-only mode: nothing in the top bar points to the kitchen side, not even the name.
          ? <Link to="/povesti/acasa" className={home ? 'brand' : 'brand brand-sub'}><span>Povești</span></Link>
          : <Link to="/" className={home ? 'brand' : 'brand brand-sub'}><span>Bucătăria</span> <span>cu povești</span></Link>}
        <nav>
          {/* On phones these live in the bottom tab bar; wide screens show them here (recipes side only). */}
          <NavLink to="/retete" className="wide-only day-only">Rețetele mele</NavLink>
          <NavLink to="/saptamana" className="wide-only day-only">Săptămâna</NavLink>
          <NavLink to="/cumparaturi" className="wide-only day-only">Cumpărături</NavLink>
          {kid ? <KidLockButton /> : <>
          {!profile && <AreaSwitch />}
          {/* On phones the Profile is the last tab; wide screens have no tab bar, so it sits here. */}
          <NavLink to="/profil" className="icon-link profile-link wide-only" aria-label="Profil și setări" title="Profil">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PROFILE} /></svg>
          </NavLink>
          </>}
        </nav>
      </header>}
      {!online && <div className="offline-banner">Ești offline. Vezi rețetele și poveștile salvate pe acest dispozitiv.</div>}
      <main>
        {/* Phones have no top bar: pages that need a way back get the arrow at the top of the page. */}
        {back && !kid && !player && <div className={back === '/retete' ? 'page-back over' : 'page-back'}><BackButton to={back} /></div>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/retete" element={<RecipeList />} />
          <Route path="/retete/noua" element={<RecipeEdit />} />
          <Route path="/retete/:id" element={<RecipeView />} />
          <Route path="/retete/:id/editeaza" element={<RecipeEdit />} />
          <Route path="/retete/:id/gateste" element={<CookMode />} />
          <Route path="/povesti" element={<StoryList />} />
          <Route path="/povesti/adauga" element={<StoryAdd />} />
          <Route path="/povesti/acasa" element={<StoriesHome />} />
          <Route path="/povesti/:id" element={<StoryPlayer />} />
          <Route path="/cauta" element={<Search />} />
          <Route path="/saptamana" element={<Week />} />
          <Route path="/cumparaturi" element={<Shopping />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/profil/:page" element={<Profile />} />
          {/* Old Settings links (bookmarks, notes) */}
          <Route path="/setari" element={<Navigate to="/profil" replace />} />
          <Route path="/setari/povesti" element={<Navigate to="/profil/copil" replace />} />
          <Route path="/setari/retete" element={<Navigate to="/profil/bucatarie" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <KidGate />
      <MiniPlayer />
      <TabBar />
      <ToastHost />
      <LeaveConfirm />
    </>
  )
}

export default function App() {
  useSettingsSync()
  // Signed back in after "Am uitat PIN-ul": kid mode off, PIN cleared.
  useEffect(applyPinReset, [])
  return (
    <BrowserRouter>
      <NowPlayingProvider>
        <Shell />
      </NowPlayingProvider>
    </BrowserRouter>
  )
}
