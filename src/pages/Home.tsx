import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="home">
      <Link to="/retete" className="tile tile-recipes">
        <span className="tile-emoji">🥘</span>
        <span className="tile-title">Rețete</span>
        <span className="tile-sub">Rețetele familiei, mereu la îndemână</span>
      </Link>
      <Link to="/povesti" className="tile tile-stories">
        <span className="tile-emoji">🌙</span>
        <span className="tile-title">Povești</span>
        <span className="tile-sub">Povești audio pentru cei mici</span>
      </Link>
    </div>
  )
}
