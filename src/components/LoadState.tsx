/** Shown when a page could not load its data: says so plainly and offers to try again. */
export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <p>{text}</p>
      <button type="button" className="btn" onClick={onRetry}>Încearcă din nou</button>
    </div>
  )
}

/** A quiet placeholder while a page loads, so the screen is never blank. */
export function Loading({ label = 'Se încarcă…' }: { label?: string }) {
  return <p className="loading" role="status"><span className="spinner" aria-hidden="true" /> {label}</p>
}
