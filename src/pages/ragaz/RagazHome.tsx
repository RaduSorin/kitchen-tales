import { Link } from 'react-router-dom'
import { lockVault } from '../../lib/mind/vault'
import '../../ragaz.css'

/**
 * /ragaz: the module's page. For now only the frame: the month's intention, the Friday themes
 * and the journal come with the next steps of the plan.
 */
export default function RagazHome() {
  return (
    <section className="ragaz rg-home">
      <div className="rg-head">
        <div>
          <span className="cs-kicker">Răgaz</span>
          <h1>Luna mea</h1>
        </div>
        <button type="button" className="night-btn" aria-label="Blochează Răgaz" onClick={lockVault}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
        </button>
      </div>
      <div className="rg-intent">
        <span className="rg-label">Intenția lunii</span>
        <p>Aici va sta intenția ta, mereu la vedere.</p>
      </div>
      <div className="rg-card rg-soon">
        <div>
          <b>Urmează</b>
          <small>Intenția lunii, exercițiile de vineri și jurnalul. Ce scrii aici se salvează criptat, doar pe acest telefon (plus copia criptată, dacă e pornită).</small>
        </div>
      </div>
      <Link to="/profil/ragaz" className="btn rg-settings-link">Setări Răgaz</Link>
    </section>
  )
}
