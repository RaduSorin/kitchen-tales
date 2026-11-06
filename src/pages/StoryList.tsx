import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cachedFolders, createFolder, deleteFolder, downloadStory, listFolders, listStories, saveFolder, setFolderShared } from '../lib/db'
import type { Story, StoryFolder } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { builtinFolderOf, folderOf, getLastStoryId, getPosition, groupFolders, SOURCE_COLOR, SOURCE_LABEL } from '../lib/stories'
import FolderSheet from '../components/FolderSheet'
import Sheet from '../components/Sheet'
import { showToast } from '../lib/toast'
import StoryCover from '../components/StoryCover'
import ShareIcon from '../components/ShareIcon'
import { focusField } from '../lib/keyboard'
import { useKid } from '../lib/kidMode'
import { useGlow } from '../lib/glow'

import { matchesQuery, norm } from '../lib/format'
import { folderView, isBookView, newLabel, rememberShelfPick, renameFolderView, saveSeen, seenStories, setFolderView, shelfPick, useFolderViews, useLandscape } from '../lib/shelf'
import ViewSwitch from '../components/ViewSwitch'
import FolderMenu from '../components/FolderMenu'
import BookShelf from '../components/BookShelf'
import CoverFlow from '../components/CoverFlow'

const count = (n: number) => `${n} ${n === 1 ? 'poveste' : 'povești'}`
const minutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`
/** Seconds left of a story you started (and haven't finished), else undefined. */
function left(s: Story) {
  const pos = getPosition(s.id)
  return pos > 5 && s.durationSec && pos < s.durationSec - 5 ? s.durationSec - pos : undefined
}
/** How far into a started story you are, drawn as a ring on its cover. */
function Ring({ part }: { part: number }) {
  const c = 2 * Math.PI * 8

  return (
    <svg className="sa-ring" width="28" height="28" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="rgb(0 0 0 / .5)" />
      <circle cx="13" cy="13" r="8" fill="none" stroke="rgb(255 255 255 / .3)" strokeWidth="3" />
      <circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * Math.min(1, part)} ${c}`} transform="rotate(-90 13 13)" />
    </svg>
  )
}
/** Total listening time of a folder: "45 min", "2 h", "1 h 30". */
function total(items: Story[]) {
  const min = Math.round(items.reduce((t, s) => t + (s.durationSec ?? 0), 0) / 60)
  if (!min) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m && h < 10 ? `${h} h ${m}` : `${h} h`
}

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
  // Kid mode: the shelf only plays; nothing is added, saved, renamed or deleted.
  const kid = useKid().active
  const online = useOnline()
  const parent = online && !kid
  const { child } = useSettings()
  // The family's own folders; shown even while empty (only with internet, like the rest of the full shelf).
  const [rows, setRows] = useState<StoryFolder[]>(cachedFolders)
  const [editing, setEditing] = useState<'new' | 'open'>()
  const [menu, setMenu] = useState(false)
  const closeMenu = useCallback(() => setMenu(false), [])
  const reload = () => Promise.all([listStories().then(setStories), listFolders().then(setRows)])
  useEffect(() => {
    listStories().then(setStories).catch(() => setError('Nu pot încărca poveștile fără internet.')).finally(() => setLoading(false))
    listFolders().then(setRows)
  }, [])

  const available = online ? stories : stories.filter((s) => offline.has(s.id))
  const folders = groupFolders(available, online ? rows : [])
  // The open folder lives in the address, so the browser's Back returns to the folders.
  const open = folders.length > 1 ? folders.find((f) => f.name === params.get('folder')) : folders[0]
  const inFolder = !!open && folders.length > 1

  // Squares, list, bookshelf or Cover Flow: chosen per folder; turned sideways, the bookshelf.
  useFolderViews()
  const landscape = useLandscape()
  const view = open && !favMode ? folderView(open.name, landscape) : 'grid'
  const books = isBookView(view)
  const wideShelf = books && landscape && !!open && !favMode
  const [selId, setSelId] = useState<string>()
  useEffect(() => {
    if (!wideShelf) return
    // Sideways, the bookshelf gets the whole screen: no top bar, tab bar or mini player.
    document.documentElement.dataset.shelfWide = ''
    window.scrollTo(0, 0)
    return () => { delete document.documentElement.dataset.shelfWide }
  }, [wideShelf])

  // Stories this device has not shown on a shelf yet: a badge on their folder, and an animation
  // that puts them on the shelf when the folder is opened. The first time, every story counts as seen.
  const [seen, setSeen] = useState(seenStories)
  const [arrivals, setArrivals] = useState<{ folder: string; ids: string[] }>()
  useEffect(() => {
    if (loading || kid || seen || error) return
    const all = Object.fromEntries(stories.map((s) => [s.id, folderOf(s)]))
    saveSeen(all)
    setSeen(all)
  }, [loading, kid, seen, stories, error])
  const openName = open?.name
  // A folder opens at its top (not at the grid's scroll offset); back on the grid, where it was.
  const gridScroll = useRef(0)
  const shownFolder = useRef(inFolder ? openName : undefined)
  useLayoutEffect(() => {
    const now = inFolder ? openName : undefined
    if (now === shownFolder.current) return
    window.scrollTo(0, now ? 0 : gridScroll.current)
    shownFolder.current = now
  }, [inFolder, openName])
  // By story, not by folder: a renamed folder, or one deleted, doesn't make its stories new again.
  const freshIds = seen && open && !favMode ? open.items.filter((s) => !(s.id in seen)).map((s) => s.id) : []
  const freshKey = freshIds.join(',')
  useEffect(() => {
    if (!seen || !openName || !freshKey) return
    const ids = freshKey.split(',')
    // In shelf order, which is the folder's order (the newest first).
    setArrivals({ folder: openName, ids })
    const next = { ...seen }
    ids.forEach((id) => { next[id] = openName })
    saveSeen(next)
    setSeen(next)
  }, [seen, openName, freshKey])
  const arriving = arrivals && arrivals.folder === openName ? arrivals.ids : []
  const arrived = (id: string) => setArrivals((a) => a && { ...a, ids: a.ids.filter((x) => x !== id) })
  // Squares and list: the new ones just pop in.
  const popping = !books && arriving.length > 0
  useEffect(() => {
    if (!popping) return
    const t = setTimeout(() => setArrivals(undefined), 900)
    return () => clearTimeout(t)
  }, [popping])
  const unseen = (items: Story[]) => (seen ? items.filter((s) => !(s.id in seen)).length : 0)
  const pickView = (v: typeof view) => { if (open) setFolderView(open.name, v, landscape) }
  // The chosen book, remembered per folder so it is still chosen after opening a story and coming back.
  const pick = (id: string) => { setSelId(id); if (open) rememberShelfPick(open.name, id) }
  const openStory = (s: Story) => { pick(s.id); nav(`/povesti/${s.id}`, { state: { fromFolder: true } }) }
  // Searching looks through every story (or only the open folder), ignoring diacritics.
  const query = norm(q.trim())
  const searching = !!query
  const shown = searching
    ? (inFolder ? open.items : available).filter((s) => matchesQuery(`${s.title} ${s.collection ?? ''}`, query))
    : open?.items ?? []
  const missing = (inFolder ? open.items : stories).filter((s) => !offline.has(s.id))
  const lastId = getLastStoryId()
  const last = available.find((s) => s.id === lastId)
  // The book chosen in a folder (on the shelf, or the last one opened), else the folder's first picture.
  const chosenId = [selId, open && shelfPick(open.name), lastId].find((id) => id && shown.some((s) => s.id === id))
  const chosen = shown.find((s) => s.id === chosenId)
  // The background glows in the colours of the story in focus: the chosen book in a folder,
  // the story to continue on the folders page.
  useGlow(favMode ? undefined : inFolder || (open && folders.length === 1) ? chosen ?? shown.find((s) => s.coverKey) ?? shown[0] : last)

  const downloadAll = async () => {
    setError('')
    for (const [i, s] of missing.entries()) {
      setProgress(`Descarc ${i + 1} din ${missing.length}…`)
      try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    }
    setProgress(undefined)
  }

  const [sharing, setSharing] = useState(false)
  const [askShare, setAskShare] = useState(false)
  const shareFolder = async (shared: boolean) => {
    if (!open) return
    setAskShare(false)
    setSharing(true); setError('')
    try {
      await setFolderShared(open, shared)
      await reload()
      showToast(shared ? 'Folderul e partajat cu toate conturile' : 'Folderul e acum doar în spațiul nostru')
    } catch { setError('Nu am putut schimba partajarea. Încearcă din nou.') }
    setSharing(false)
  }

  const downloadOne = async (s: Story) => {
    setError('')
    setSaving((prev) => new Set(prev).add(s.id))
    try { await downloadStory(s) } catch { setError(`Nu am putut descărca „${s.title}”.`) }
    setSaving((prev) => { const next = new Set(prev); next.delete(s.id); return next })
  }

  return (
    <section className={`shelf${wideShelf ? ' shelf-wide' : ''}`}>
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
            <div className="folder-title">
              <h1>{open.icon && <span className="folder-icon" aria-hidden="true">{open.icon} </span>}{open.name}</h1>
              {/* Upright: how many stories and who can see them, in one small line under the name. */}
              {!favMode && !wideShelf && (
                <div className="folder-sub">
                  {open.items.length > 0 && <span>{count(open.items.length)}</span>}
                  {parent && (open.mine ? online && open.items.length > 0 && (
                    <button type="button" className="share-chip" aria-pressed={open.shared} aria-haspopup="dialog" disabled={sharing} onClick={() => setAskShare(true)}>
                      <ShareIcon shared={open.sharedCount > 0} />
                      {sharing ? 'Se salvează…' : open.shared ? 'Partajat' : open.sharedCount ? 'Parțial partajat' : 'Doar la noi'}
                      <span className="sr-only">{open.shared ? ' cu toate conturile' : open.sharedCount ? `: ${open.sharedCount} din ${open.items.length} povești sunt partajate` : ' în spațiul nostru'}. Apasă ca să alegi cine vede folderul.</span>
                    </button>
                  ) : (
                    <span className="share-note">de la {open.items[0]?.spaceName ?? open.row?.spaceName ?? 'alt cont'}, doar ascultare</span>
                  ))}
                </div>
              )}
            </div>
            {parent && (
              <span className="folder-more-wrap">
                <button type="button" className="night-btn folder-more" aria-label={`Mai multe pentru folderul ${open.name}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
                {menu && (
                  <FolderMenu onClose={closeMenu}
                    view={open.items.length > 0 && !wideShelf ? view : undefined} onView={pickView}
                    onShare={open.mine && online && open.items.length > 0 ? () => setAskShare(true) : undefined}
                    offline={open.items.length > 0 ? { missing: missing.length, progress, save: downloadAll } : undefined}
                    onRename={!open.builtin && open.mine ? () => setEditing('open') : undefined} />
                )}
              </span>
            )}
          </div>
        ) : (
          <h1>Bibliotecă</h1>
        )}
        {/* The count sits at the right of the title row, to save vertical space. */}
        {!favMode && inFolder && wideShelf && open.items.length > 0 && <span className="shelf-count">{count(open.items.length)}</span>}
        {wideShelf && <ViewSwitch value={view} onChange={pickView} />}
        {parent && !inFolder && !favMode && (
          <Link to="/povesti/adauga" className="night-btn lib-add" aria-label="Adaugă o poveste">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </Link>
        )}
        {parent && (!inFolder || open.mine) && <Link to={inFolder && !open.builtin && open.mine ? `/povesti/adauga?folder=${encodeURIComponent(open.name)}` : '/povesti/adauga'} className="night-btn wide-add" aria-label="Adaugă o poveste">+</Link>}
      </div>

      {available.length > 0 && !favMode && !wideShelf && (
        <div className="search-row">
          <label className="search-box night-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input type="search" id="story-search" aria-label="Caută povești" placeholder={inFolder ? `Caută în ${open.name}` : `Caută în ${available.length === 1 ? 'o poveste' : `${available.length}${available.length % 100 >= 20 || (available.length >= 100 && available.length % 100 === 0) ? ' de' : ''} povești`}`} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {open && (inFolder || !searching) && open.items.length > 0 && <ViewSwitch value={view} onChange={pickView} collapsible />}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {favMode ? (loading ? <p className="empty">Se încarcă…</p> : (() => {
        const favs = available.filter((s) => s.favorite).sort((a, b) => a.title.localeCompare(b.title, 'ro'))
        return favs.length ? (
          <div className="covers">
            {favs.map((s) => (
              <div key={s.id} className="cover-slot">
                <Link to={`/povesti/${s.id}`} state={{ fromFolder: true, from: 'favorites' }} className="cover-card">
                  <span className="sa-cover">
                    <StoryCover story={s} />
                    {left(s) !== undefined ? <Ring part={getPosition(s.id) / (s.durationSec || 1)} /> : s.durationSec ? <span className="sa-dur">{minutes(s.durationSec)}</span> : null}
                  </span>
                  <span className="cover-title">{s.title}</span>
                  <small className="cover-meta">{left(s) !== undefined ? `Mai sunt ${minutes(left(s)!)}` : folderOf(s)}</small>
                </Link>
              </div>
            ))}
          </div>
        ) : <p className="empty fav-empty">Nicio poveste preferată încă.<br />Deschide o poveste și apasă inimioara ♥ de sus.</p>
      })()) : loading ? <p className="empty">Se încarcă…</p> : available.length === 0 ? (
        <p className="empty">{kid ? 'Nicio poveste aici încă.' : online ? 'Nicio poveste încă. Apasă + ca să adaugi una.' : 'Nicio poveste salvată pe acest dispozitiv.'}</p>
      ) : searching && shown.length === 0 ? (
        <p className="empty">Nicio poveste găsită pentru „{q.trim()}”.</p>
      ) : !open && !searching ? (
        <div className="collections">
          {folders.map((f) => {
            // The folder as a collection card: its covers tint the card, three of them fan out on the right.
            const art = [...f.items.filter((s) => s.coverKey), ...f.items.filter((s) => !s.coverKey)]
            const fresh = unseen(f.items)
            const started = f.items.filter((s) => getPosition(s.id) > 5).length
            const time = total(f.items)
            return (
              <button key={f.name} type="button" className="folder-card collection" onClick={() => { gridScroll.current = window.scrollY; setParams({ folder: f.name }, { state: { fromShelf: true } }) }}>
                {art[0] && <StoryCover story={art[0]} className="collection-tint" />}
                <span className="collection-text">
                  <span className="cover-title">{f.icon && <span aria-hidden="true">{f.icon} </span>}{f.name}</span>
                  <small className="cover-meta">{f.items.length ? count(f.items.length) : 'gol'}{time && ` · ${time}`}</small>
                  {(fresh > 0 || started > 0) && (
                    <span className="collection-tags">
                      {fresh > 0 && <span className="tag-new">{newLabel(fresh)}</span>}
                      {started > 0 && <span>{started} în curs</span>}
                    </span>
                  )}
                </span>
                <span className={`collection-covers n${Math.min(3, art.length)}`} aria-hidden="true">
                  {art.length === 0
                    ? <span className="folder-plus">{f.icon ?? '📁'}</span>
                    : art.slice(0, 3).reverse().map((s) => <StoryCover key={s.id} story={s} />)}
                </span>
              </button>
            )
          })}
          {parent && (
            <button type="button" className="folder-card collection folder-new" onClick={() => setEditing('new')}>
              <span className="collection-text"><span className="cover-title">Folder nou</span><small className="cover-meta">pentru povești sau muzică</small></span>
              <span className="collection-covers" aria-hidden="true"><span className="folder-plus">+</span></span>
            </button>
          )}
        </div>
      ) : inFolder && !searching && open.items.length === 0 ? (
        <p className="empty">Folderul e gol.{!kid && <><br />Deschide o poveste și alege „Mută în folder” din „Pentru părinți”.</>}</p>
      ) : books ? (
        (() => {
          const props = {
            items: shown, // same order as the squares: the first square is the first book on the top shelf
            selId: chosenId,
            onSelect: pick, onOpen: openStory, onArrived: arrived, wide: wideShelf,
            arriving: searching ? [] : arriving,
          }
          return view === 'shelf' ? <BookShelf {...props} /> : <CoverFlow {...props} />
        })()
      ) : (
        <div className={view === 'list' ? 'story-rows' : 'covers'}>
          {shown.map((s) => (
            <div key={s.id} className={`${view === 'list' ? 'row-slot' : 'cover-slot'}${popping && arriving.includes(s.id) ? ' pop-in' : ''}`}>
              <Link to={`/povesti/${s.id}`} state={{ fromFolder: true }} className={view === 'list' ? 'story-row' : 'cover-card'} onClick={() => pick(s.id)}>
                <span className="sa-cover">
                  <StoryCover story={s} />
                  {view !== 'list' && (left(s) !== undefined ? <Ring part={getPosition(s.id) / (s.durationSec || 1)} /> : s.durationSec ? <span className="sa-dur">{minutes(s.durationSec)}</span> : null)}
                </span>
                <span className="row-text">
                  <span className="cover-title">{s.title}</span>
                  <small className="cover-meta">
                    {s.mine && !s.shared && <span className="private-mark" title="Doar în spațiul nostru" aria-label="Doar în spațiul nostru">🔒 </span>}
                    {left(s) !== undefined ? `Mai sunt ${minutes(left(s)!)}` : <>
                      {!s.collection && <><i style={{ background: SOURCE_COLOR[s.source] }} />{SOURCE_LABEL[s.source]}</>}
                      {s.durationSec ? `${s.collection ? '' : ' · '}${minutes(s.durationSec)}` : ''}
                    </>}
                  </small>
                  {view === 'list' && left(s) !== undefined && <span className="sa-progress row-progress"><i style={{ width: `${Math.round(Math.min(1, getPosition(s.id) / (s.durationSec || 1)) * 100)}%` }} /></span>}
                </span>
              </Link>
              {s.favorite && (
                <span className="fav-dot" title="La favorite" aria-label="La favorite">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" fill="currentColor" /></svg>
                </span>
              )}
              {kid ? null : offline.has(s.id)
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

      {editing === 'new' && (
        <FolderSheet taken={folders.map((f) => f.name)} onClose={() => setEditing(undefined)}
          onSave={async (name, icon) => {
            await createFolder(name, icon)
            await reload()
            setParams({ folder: name }, { state: { fromShelf: true } })
          }} />
      )}
      {askShare && inFolder && (() => {
        // Who sees the folder: a choice in a sheet, never a single tap, and it says what changes.
        const total = open.items.length
        const privateCount = total - open.sharedCount
        const many = (n: number) => (n === 1 ? 'o poveste' : `${n} povești`)
        return (
          <Sheet title="Cine vede folderul?" onClose={() => setAskShare(false)}>
            <p className="sheet-text">
              {open.shared ? `Toate cele ${many(total)} sunt partajate cu toate conturile.`
                : open.sharedCount ? `${open.sharedCount} din ${total} povești sunt partajate cu toate conturile, ${privateCount === 1 ? "una e" : `${privateCount} sunt`} doar în spațiul nostru.`
                : `${total === 1 ? 'Povestea e' : `Toate cele ${total} povești sunt`} doar în spațiul nostru.`}
            </p>
            <div className="menu-list">
              <button type="button" className="btn share-toggle" aria-pressed={open.shared} disabled={open.shared} onClick={() => shareFolder(true)}>
                <ShareIcon shared size={18} />
                {open.shared ? 'Partajat cu toate conturile' : `Partajează cu toate conturile${privateCount && open.sharedCount ? ` (încă ${many(privateCount)})` : ''}`}
              </button>
              <button type="button" className="btn share-toggle" aria-pressed={!open.sharedCount} disabled={!open.sharedCount} onClick={() => shareFolder(false)}>
                <ShareIcon shared={false} size={18} />
                {open.sharedCount ? 'Doar în spațiul nostru' : 'Doar în spațiul nostru (acum)'}
              </button>
              <p className="share-note">Partajarea se aplică folderului și fiecărei povești din el. Poveștile adăugate apoi în folder îi iau partajarea.</p>
            </div>
          </Sheet>
        )
      })()}
      {editing === 'open' && inFolder && !open.builtin && open.mine && (() => {
        const sources = new Set(open.items.map(builtinFolderOf))
        return (
          <FolderSheet folder={{ name: open.name, icon: open.icon, count: open.items.length, fallback: sources.size === 1 ? [...sources][0] : undefined }}
            taken={folders.map((f) => f.name)} onClose={() => setEditing(undefined)}
            onSave={async (name, icon) => {
              await saveFolder(open.name, open.row, name, icon, stories)
              if (name !== open.name) {
                // A renamed folder keeps its view, and its stories don't count as new.
                renameFolderView(open.name, name)
                if (seen) {
                  const next = Object.fromEntries(Object.entries(seen).map(([id, f]) => [id, f === open.name ? name : f]))
                  saveSeen(next)
                  setSeen(next)
                }
              }
              await reload()
              if (name !== open.name) setParams({ folder: name }, { replace: true, state: location.state })
            }}
            onDelete={async () => {
              await deleteFolder(open.name, open.row, stories)
              await reload()
              showToast(`Folderul „${open.name}” a fost șters.`)
              setParams({}, { replace: true })
            }} />
        )
      })()}
    </section>
  )
}
