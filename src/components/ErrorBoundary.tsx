import { Component, type ReactNode } from 'react'
import { reportError } from '../lib/errorReport'

/**
 * A page that crashes while drawing shows a way back instead of a blank screen, and the error
 * is reported (src/lib/errorReport.ts).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    reportError(error, 'render')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="not-found">
        <h1>Ceva n-a mers</h1>
        <p>Pagina s-a oprit din cauza unei erori. Detaliile au plecat automat, ca să o putem repara.</p>
        <button className="btn primary" type="button" onClick={() => window.location.replace('/')}>Mergi la Acasă</button>
      </section>
    )
  }
}
