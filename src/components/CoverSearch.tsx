import { useEffect, useState } from 'react'
import { findCovers, type CoverCandidate } from '../lib/db'

const SOURCE = { itunes: 'iTunes', wikipedia: 'Wikipedia' } as Record<string, string>

// Searches covers by the story title and lets a parent tap one. With `auto`, it searches right away.
export default function CoverSearch({ title, artist, auto, chosen, onPick }: {
  title: string
  artist?: string
  auto?: boolean
  chosen?: string
  onPick: (c: CoverCandidate) => void
}) {
  const [found, setFound] = useState<CoverCandidate[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState('')

  const run = async (t = title) => {
    if (!t.trim()) return
    setBusy(true); setError(''); setSearched(t)
    try { setFound(await findCovers(t.trim(), artist)) } catch { setError('Căutarea nu a mers acum. Încearcă din nou.') }
    setBusy(false)
  }
  // Only when asked to search by itself (a new file picked), not again on every change of the title.
  useEffect(() => { if (auto && title.trim()) run(title) }, [auto]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cover-search">
      {busy ? <p className="importing"><span className="spinner" /> Caut coperte pentru „{searched}”…</p> : (
        <button type="button" className="link-btn" disabled={!title.trim()} onClick={() => run()}>
          {found && searched === title ? 'Caută din nou' : 'Caută coperta pe internet'}
        </button>
      )}
      {found && !busy && (found.length === 0
        ? <small>Nu am găsit nimic pentru „{searched}”. Încearcă alt titlu sau alege o poză.</small>
        : (
          <div className="cover-results" role="list">
            {found.map((c) => (
              <button type="button" role="listitem" key={c.url} className={c.url === chosen ? 'on' : ''} aria-pressed={c.url === chosen}
                title={c.label ?? ''} onClick={() => onPick(c)}>
                <img src={c.url} alt={c.label ?? ''} loading="lazy" referrerPolicy="no-referrer" />
                <small>{SOURCE[c.source] ?? c.source}</small>
              </button>
            ))}
          </div>
        ))}
      {error && <small className="error">{error}</small>}
    </div>
  )
}
