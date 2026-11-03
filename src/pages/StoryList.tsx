import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { downloadStory, listStories } from '../lib/db'
import type { Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, getLastStoryId, getPosition, groupFolders, SOURCE_COLOR, SOURCE_LABEL } from '../lib/stories'
import StoryCover from '../components/StoryCover'
import { focusField } from '../lib/keyboard'

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const count = (n: number) => `${n} ${n === 1 ? 'poveste' : 'povești'}`

export default function StoryList() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>()
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [params, setParams] = useSearchParams()
  // The search box starts empty again whenever you open or leave a folder.
  const folderParam = params.get('folder')
  const [search, setSearch] = useState({ folder: folderParam, q: '' })
  const q = search.folder === folderParam ? search.q : ''
  const setQ = (v: string) => setSearch({ folder: folderParam, q: v })
  const location = useLocation()
  const nav = useNavigate()
  const offline = useOfflineIds()
  // The "Caută" tab opens the shelf with ?cauta=1 and puts the cursor in the search box.
  const wantsSearch = params.has('cauta')
  // The "Favorite" tab opens the shelf with ?favorite=1.
  const favMode = params.has('favorite')
  // Re-runs when the box appears after loading; also on a repeat tap of the tab (location.key).
  const hasBox = !loading && !favMode
  useEffect(() => { if (wantsSearch && hasBox) focusField(document.getElementById('story-search')) }, [wantsSearch, hasBox, location.key])
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
  // Searching looks through every story (or only the open folder), ignoring diacritics.
  const query = norm(q.trim())
  const searching = !!query
  const shown = searching
    ? (inFolder ? open.items : available).filter((s) => norm(`${s.title} ${s.collection ?? ''}`).includes(query))
    : open?.items ?? []
  const missing = (inFolder ? open.items : stories).filter((s) => !offline.has(s.id))
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
        {favMode ? (
          <div>
            <h1>Favorite</h1>
            <p className="shelf-sub">Poveștile preferate{child.name ? ` ale lui ${child.name}` : ''}</p>
          </div>
        ) : inFolder ? (
          <div className="folder-head">
            <button type="button" className="night-btn" aria-label="Înapoi la foldere" onClick={() => {
              // Step back in history when we opened the folder from the shelf, so Back doesn't loop.
              if ((location.state as { fromShelf?: boolean } | null)?.fromShelf) nav(-1)
              else setParams({}, { replace: true })
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <h1>{open.name}</h1>
          </div>
        ) : (
          <h1>Bibliotecă</h1>
        )}
        {/* The count sits at the right of the title row, to save vertical space. */}
        {!favMode && (inFolder ? open.items.length : available.length) > 0 && (
          <span className="shelf-count">{count(inFolder ? open.items.length : available.length)}</span>
        )}
        {online && <Link to="/povesti/adauga" className="night-btn wide-add" aria-label="Adaugă o poveste">+</Link>}
      </div>

      {available.length > 0 && !favMode && (
        <label className="search-box night-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" id="story-search" aria-label="Caută povești" placeholder={inFolder ? `Caută în ${open.name}` : 'Caută o poveste'} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}

      {last && !inFolder && !searching && !favMode && (
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
      {favMode ? (loading ? <p className="empty">Se încarcă…</p> : (() => {
        const favs = available.filter((s) => s.favorite).sort((a, b) => a.title.localeCompare(b.title, 'ro'))
        return favs.length ? (
          <div className="covers">
            {favs.map((s) => (
              <div key={s.id} className="cover-slot">
                <Link to={`/povesti/${s.id}`} state={{ fromFolder: true, from: 'favorites' }} className="cover-card">
                  <StoryCover story={s} />
                  <span className="cover-title">{s.title}</span>
                  {s.durationSec ? <small className="cover-meta">{Math.max(1, Math.round(s.durationSec / 60))} min</small> : null}
                </Link>
              </div>
            ))}
          </div>
        ) : <p className="empty fav-empty">Nicio poveste preferată încă.<br />Deschide o poveste și apasă inimioara ♥ de sus.</p>
      })()) : loading ? <p className="empty">Se încarcă…</p> : available.length === 0 ? (
        <p className="empty">{online ? 'Nicio poveste încă. Apasă + ca să adaugi una.' : 'Nicio poveste salvată pe acest dispozitiv.'}</p>
      ) : searching && shown.length === 0 ? (
        <p className="empty">Nicio poveste găsită pentru „{q.trim()}”.</p>
      ) : !open && !searching ? (
        <div className="covers">
          {folders.map((f) => (
            <button key={f.name} type="button" className="cover-card folder-card" onClick={() => setParams({ folder: f.name }, { state: { fromShelf: true } })}>
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
              <Link to={`/povesti/${s.id}`} state={{ fromFolder: true }} className="cover-card">
                <StoryCover story={s} />
                <span className="cover-title">{s.title}</span>
                <small className="cover-meta">
                  {!s.collection && <><i style={{ background: SOURCE_COLOR[s.source] }} />{SOURCE_LABEL[s.source]}</>}
                  {s.durationSec ? `${s.collection ? '' : ' · '}${Math.max(1, Math.round(s.durationSec / 60))} min` : ''}
                </small>
              </Link>
              {s.favorite && (
                <span className="fav-dot" title="La favorite" aria-label="La favorite">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" fill="currentColor" /></svg>
                </span>
              )}
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

      {online && stories.length > 0 && !favMode && (
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
