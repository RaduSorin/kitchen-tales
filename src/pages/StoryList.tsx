import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadStory, listStories } from '../lib/db'
import type { Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'

export default function StoryList() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>()
  const offline = useOfflineIds()
  const online = useOnline()
  useEffect(() => {
    listStories().then(setStories).catch(() => setError('Nu pot încărca poveștile fără internet.')).finally(() => setLoading(false))
  }, [])

  const missing = stories.filter((s) => !offline.has(s.id))
  const shown = online ? stories : stories.filter((s) => offline.has(s.id))

  const downloadAll = async () => {
    setError('')
    for (const [i, s] of missing.entries()) {
      setProgress(`Descarc ${i + 1} din ${missing.length}…`)
      try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    }
    setProgress(undefined)
  }

  return (
    <section className="stories">
      <div className="row between">
        <h1>Povești</h1>
        {online && <Link to="/povesti/adauga" className="btn primary">+ Adaugă</Link>}
      </div>
      {online && stories.length > 0 && (
        <div className="offline-bar">
          {missing.length === 0
            ? <span>✓ Toate poveștile sunt salvate pe acest dispozitiv</span>
            : progress
              ? <span><span className="spinner" /> {progress}</span>
              : <button className="btn small" onClick={downloadAll}>⬇️ Salvează toate pentru offline ({missing.length})</button>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {loading ? <p className="empty">Se încarcă…</p> : shown.length === 0 ? (
        <p className="empty">{online ? 'Nicio poveste încă. Încarcă un MP3 sau înregistrează una cu vocea ta!' : 'Nicio poveste salvată pe acest dispozitiv.'}</p>
      ) : (
        <div className="story-grid">
          {shown.map((s) => (
            <Link key={s.id} to={`/povesti/${s.id}`} className="story-tile">
              {offline.has(s.id) && <span className="saved-badge" title="Salvată pe dispozitiv">✓</span>}
              <span className="story-emoji">{s.emoji}</span>
              <span className="story-title">{s.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
