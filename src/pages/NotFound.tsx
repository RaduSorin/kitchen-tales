import { Link } from 'react-router-dom'

/** Any address the app does not know. */
export default function NotFound() {
  return (
    <section className="not-found">
      <h1>Pagina nu există</h1>
      <p>Linkul poate fi vechi sau greșit.</p>
      <Link to="/" className="btn primary">Mergi la Acasă</Link>
    </section>
  )
}
