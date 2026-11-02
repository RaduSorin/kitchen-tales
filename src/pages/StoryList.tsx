import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadStory, listStories } from '../lib/db'
import type { Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, getLastStoryId, getPosition, greeting, groupFolders, SOURCE_COLOR, SOURCE_LABEL } from '../lib/stories'
import StoryCover from '../components/StoryCover'

export default function StoryList() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>()
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [params, setParams] = useSearchParams()
  const offline = useOfflineIds()
  const online = useOnline()
  const { child } = useSettings()
  useEffect(() => {
    listStories().then(setStories).catch(() => setError('Nu pot încărca poveștile fără internet.')).finally(() => setLoading(false))
  }, [])

  const available = online ? stories : stories.filter((s) => offline.has(s.id))
  const folders = groupFolders(available)
  // The open folder lives in the address, so the browser's Back returns to the folders.
  const open = folders.length > 1 ? folders.find((f) => f.name === params.get('folder')) : folders[0]
  const inFolder = !!open && folders.length > 1
  const shown = open?.items ?? []
  const missing = (inFolder ? shown : stories).filter((s) => !offline.has(s.id))
  const lastId = getLastStoryId()
  const last = available.find((s) => s.id === lastId)
  const lastPos = last ? getPosition(last.id) : 0

  const downloadAll = async () => {
    setError('')
    for (const [i, s] of missing.entries()) {
      setProgress(`Descarc ${i + 1} din ${missing.length}…`)
      try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    }
    setProgress(undefined)
  }

  const downloadOne = async (s: Story) => {
    setError('')
    setSaving((prev) => new Set(prev).add(s.id))
    try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    setSaving((prev) => { const next = new Set(prev); next.delete(s.id); return next })
  }

  return (
    <section className="shelf">
      <div className="shelf-head">
        {inFolder ? (
          <div className="folder-head">
            <button type="button" className="night-btn" aria-label="Înapoi la foldere" onClick={() => setParams({})}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <div>
              <h1>{open.name}</h1>
              <p className="shelf-sub">{open.items.length} {open.items.length === 1 ? 'poveste' : 'povești'}</p>
            </div>
          </div>
        ) : (
          <div>
            <h1>{greeting()}{child.name ? `, ${child.name}` : ''}</h1>
            <p className="shelf-sub">Ce poveste ascultăm?</p>
          </div>
        )}
        {online && <Link to="/povesti/adauga" className="night-btn" aria-label="Adaugă o poveste">+</Link>}
      </div>

      {last && !inFolder && (
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

      {error && <p className="error">{error}</p>}
      {loading ? <p className="empty">Se încarcă…</p> : available.length === 0 ? (
        <p className="empty">{online ? 'Nicio poveste încă. Apasă + ca să adaugi una.' : 'Nicio poveste salvată pe acest dispozitiv.'}</p>
      ) : !open ? (
        <div className="covers">
          {folders.map((f) => (
            <button key={f.name} type="button" className="cover-card folder-card" onClick={() => setParams({ folder: f.name })}>
              <span className="folder-mosaic" aria-hidden="true">
                {[...f.items.filter((s) => s.coverKey), ...f.items.filter((s) => !s.coverKey)].slice(0, 4).map((s) => <StoryCover key={s.id} story={s} />)}
              </span>
              <span className="cover-title">{f.name}</span>
              <small className="cover-meta">{f.items.length} {f.items.length === 1 ? 'poveste' : 'povești'}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="covers">
          {shown.map((s) => (
            <div key={s.id} className="cover-slot">
              <Link to={`/povesti/${s.id}`} className="cover-card">
                <StoryCover story={s} />
                <span className="cover-title">{s.title}</span>
                <small className="cover-meta">
                  {!s.collection && <><i style={{ background: SOURCE_COLOR[s.source] }} />{SOURCE_LABEL[s.source]}</>}
                  {s.durationSec ? `${s.collection ? '' : ' · '}${Math.max(1, Math.round(s.durationSec / 60))} min` : ''}
                </small>
              </Link>
              {offline.has(s.id)
                ? <span className="saved-dot" title="Salvată pe dispozitiv" aria-label="Salvată pe dispozitiv">✓</span>
                : online && (
                  <button type="button" className="save-dot" disabled={saving.has(s.id) || !!progress}
                    title="Salvează pentru offline" aria-label={`Salvează „${s.title}” pentru offline`} onClick={() => downloadOne(s)}>
                    {saving.has(s.id) ? <span className="spinner" /> : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></svg>
                    )}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}

      {online && stories.length > 0 && (
        <div className="offline-bar">
          {missing.length === 0
            ? <span>{inFolder ? 'Poveștile din acest folder merg și fără internet.' : 'Toate poveștile merg și fără internet.'}</span>
            : progress
              ? <span><span className="spinner" /> {progress}</span>
              : <button className="link-btn" onClick={downloadAll}>{inFolder ? 'Salvează folderul pentru drum' : 'Salvează toate pentru drum'} ({missing.length})</button>}
        </div>
      )}
    </section>
  )
}
