import { useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
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
import { useArea } from './lib/area'
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

export default function App() {
  const online = useOnline()
  return (
    <BrowserRouter>
      <NowPlayingProvider>
      <NightArea />
      <header className="topbar">
        <Link to="/" className="brand"><span>Bucătăria</span> <span>cu povești</span></Link>
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
      </header>
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
        </Routes>
      </main>
      <MiniPlayer />
      <TabBar />
      </NowPlayingProvider>
    </BrowserRouter>
  )
}
