import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useBack } from './lib/back'
import NotFound from './pages/NotFound'
import Home from './pages/Home'
import { useOnline } from './lib/useOffline'
import { applyTheme, setStatusBarColor } from './lib/settings'
import RecipeList from './pages/RecipeList'
import RecipeView from './pages/RecipeView'
import RecipeEdit from './pages/RecipeEdit'
import StoryList from './pages/StoryList'
import StoryPlayer from './pages/StoryPlayer'
import StoryAdd from './pages/StoryAdd'
import Settings from './pages/Settings'
import CookMode from './pages/CookMode'
import MiniPlayer from './components/MiniPlayer'
import { NowPlayingProvider } from './lib/nowPlaying'
import TabBar from './components/TabBar'
import AreaSwitch from './components/AreaSwitch'
import { isPlayerPage, useArea } from './lib/area'
import Search from './pages/Search'
import StoriesHome from './pages/StoriesHome'
import Week from './pages/Week'
import Shopping from './pages/Shopping'

// The stories area always uses the night palette, whatever the app theme is.
function NightArea() {
  const night = useArea() === 'night'
  useEffect(() => {
    if (night) {
      document.documentElement.dataset.area = 'night'
      // Browser / status bar color follows the night palette too.
      setStatusBarColor('#171a45')
    } else {
      delete document.documentElement.dataset.area
      applyTheme()
    }
  }, [night])
  return null
}

// The gear opens the settings that match where you are: stories, recipes, or general.
function SettingsLink({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const night = useArea() === 'night'
  // Inside settings the gear keeps you where you are.
  const to = pathname.startsWith('/setari') ? pathname : night ? '/setari/povesti' : pathname.startsWith('/retete') ? '/setari/retete' : '/setari'
  return <NavLink to={to} className={() => (pathname.startsWith('/setari') ? 'icon-link active' : 'icon-link')} aria-label="Setări" title="Setări">{children}</NavLink>
}

/** Where the top bar's back arrow leads on pages that are not one of the main tabs (undefined: no arrow). */
function backFallback(pathname: string, night: boolean) {
  if (/^\/retete\/[^/]+$/.test(pathname) && pathname !== '/retete/noua') return '/retete'
  if (pathname.startsWith('/setari')) return night ? '/povesti/acasa' : '/'
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

function Shell() {
  const online = useOnline()
  const { pathname } = useLocation()
  const night = useArea() === 'night'
  const back = backFallback(pathname, night)
  const player = isPlayerPage(pathname)
  const header = useRef<HTMLElement>(null)
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
  }, [player])
  useEffect(() => {
    if (player) document.documentElement.dataset.fullscreen = ''
    else delete document.documentElement.dataset.fullscreen
  }, [player])
  return (
    <>
      <NightArea />
      {!player && <header className="topbar" ref={header}>
        {back ? <BackButton to={back} /> : <Link to="/" className="brand"><span>Bucătăria</span> <span>cu povești</span></Link>}
        <nav>
          {/* On phones these live in the bottom tab bar; wide screens show them here (recipes side only). */}
          <NavLink to="/retete" className="wide-only day-only">Rețetele mele</NavLink>
          <NavLink to="/saptamana" className="wide-only day-only">Săptămâna</NavLink>
          <NavLink to="/cumparaturi" className="wide-only day-only">Cumpărături</NavLink>
          <AreaSwitch />
          <SettingsLink>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </SettingsLink>
        </nav>
      </header>}
      {!online && <div className="offline-banner">Ești offline. Vezi rețetele și poveștile salvate pe acest dispozitiv.</div>}
      <main>
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
          <Route path="/setari" element={<Settings />} />
          <Route path="/setari/:tab" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <MiniPlayer />
      <TabBar />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <NowPlayingProvider>
        <Shell />
      </NowPlayingProvider>
    </BrowserRouter>
  )
}
