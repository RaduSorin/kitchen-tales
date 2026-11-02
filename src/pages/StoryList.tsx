import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadStory, listStories } from '../lib/db'
import type { Story, StorySource } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, getLastStoryId, getPosition, greeting, SOURCE_COLOR, SOURCE_LABEL } from '../lib/stories'
import StoryCover from '../components/StoryCover'

const FILTERS: [StorySource | '', string][] = [['', 'Toate'], ['recording', 'Vocea noastră'], ['generated', 'Povești noi'], ['upload', 'Fișiere']]

export default function StoryList() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>()
  const [filter, setFilter] = useState<StorySource | ''>('')
  const offline = useOfflineIds()
  const online = useOnline()
  const { child } = useSettings()
  useEffect(() => {
    listStories().then(setStories).catch(() => setError('Nu pot încărca poveștile fără internet.')).finally(() => setLoading(false))
  }, [])

  const available = online ? stories : stories.filter((s) => offline.has(s.id))
  const shown = available.filter((s) => !filter || s.source === filter)
  const missing = stories.filter((s) => !offline.has(s.id))
  const lastId = getLastStoryId()
  const last = available.find((s) => s.id === lastId)
  const lastPos = last ? getPosition(last.id) : 0
  const sources = new Set(available.map((s) => s.source))

  const downloadAll = async () => {
    setError('')
    for (const [i, s] of missing.entries()) {
      setProgress(`Descarc ${i + 1} din ${missing.length}…`)
      try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    }
    setProgress(undefined)
  }

  return (
    <section className="shelf">
      <div className="shelf-head">
        <div>
          <h1>{greeting()}{child.name ? `, ${child.name}` : ''}</h1>
          <p className="shelf-sub">Ce poveste ascultăm?</p>
        </div>
        {online && <Link to="/povesti/adauga" className="night-btn" aria-label="Adaugă o poveste">+</Link>}
      </div>

      {last && (
        <Link to={`/povesti/${last.id}`} className="continue">
          <StoryCover story={last} />
          <span className="continue-text">
            <b>{last.title}</b>
            <small>{lastPos > 5 ? `continuă de la ${fmtTime(lastPos)}` : 'ascultă din nou'}</small>
          </span>
          <span className="continue-play" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
          </span>
        </Link>
      )}

      {sources.size > 1 && (
        <div className="who-chips" role="tablist" aria-label="Cine citește">
          {FILTERS.filter(([k]) => !k || sources.has(k)).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {k && <i style={{ background: SOURCE_COLOR[k] }} />}{label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading ? <p className="empty">Se încarcă…</p> : shown.length === 0 ? (
        <p className="empty">{online ? 'Nicio poveste încă. Apasă + ca să adaugi una.' : 'Nicio poveste salvată pe acest dispozitiv.'}</p>
      ) : (
        <div className="covers">
          {shown.map((s) => (
            <Link key={s.id} to={`/povesti/${s.id}`} className="cover-card">
              <StoryCover story={s} />
              {offline.has(s.id) && <span className="saved-dot" title="Salvată pe dispozitiv" aria-label="Salvată pe dispozitiv">✓</span>}
              <span className="cover-title">{s.title}</span>
              <small className="cover-meta"><i style={{ background: SOURCE_COLOR[s.source] }} />{SOURCE_LABEL[s.source]}{s.durationSec ? ` · ${Math.max(1, Math.round(s.durationSec / 60))} min` : ''}</small>
            </Link>
          ))}
        </div>
      )}

      {online && stories.length > 0 && (
        <div className="offline-bar">
          {missing.length === 0
            ? <span>Toate poveștile merg și fără internet.</span>
            : progress
              ? <span><span className="spinner" /> {progress}</span>
              : <button className="link-btn" onClick={downloadAll}>Salvează toate pentru drum ({missing.length})</button>}
        </div>
      )}
    </section>
  )
}
