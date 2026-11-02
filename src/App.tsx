import { useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import { useOnline } from './lib/useOffline'
import { applyTheme } from './lib/settings'
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

// The stories area always uses the night palette, whatever the app theme is.
function NightArea() {
  const { pathname } = useLocation()
  const night = pathname.startsWith('/povesti')
  useEffect(() => {
    if (night) {
      document.documentElement.dataset.area = 'night'
      // Browser / status bar color follows the night palette too.
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#171a45')
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
  const to = pathname.startsWith('/povesti') ? '/setari/povesti' : pathname.startsWith('/retete') ? '/setari/retete' : '/setari'
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
          <NavLink to="/retete">Rețete</NavLink>
          <NavLink to="/povesti">Povești</NavLink>
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
          <Route path="/povesti/:id" element={<StoryPlayer />} />
          <Route path="/setari" element={<Settings />} />
          <Route path="/setari/:tab" element={<Settings />} />
        </Routes>
      </main>
      <MiniPlayer />
      </NowPlayingProvider>
    </BrowserRouter>
  )
}
