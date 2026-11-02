import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import RecipeList from './pages/RecipeList'
import RecipeView from './pages/RecipeView'
import RecipeEdit from './pages/RecipeEdit'
import StoryList from './pages/StoryList'
import StoryPlayer from './pages/StoryPlayer'
import StoryAdd from './pages/StoryAdd'

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="brand">🍲 Kitchen Tales</Link>
        <nav>
          <NavLink to="/retete">Rețete</NavLink>
          <NavLink to="/povesti">Povești</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/retete" element={<RecipeList />} />
          <Route path="/retete/noua" element={<RecipeEdit />} />
          <Route path="/retete/:id" element={<RecipeView />} />
          <Route path="/retete/:id/editeaza" element={<RecipeEdit />} />
          <Route path="/povesti" element={<StoryList />} />
          <Route path="/povesti/adauga" element={<StoryAdd />} />
          <Route path="/povesti/:id" element={<StoryPlayer />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
