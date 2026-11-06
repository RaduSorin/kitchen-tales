import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { deleteStory, downloadStory, getStory, removeOfflineAudio, saveFoundCover, setStoryCover, setStoryShared, uploadFile, setStoryFavorite } from '../lib/db'
import ShareIcon from '../components/ShareIcon'
import { saveCover } from '../lib/offline'
import { resizeImage } from '../lib/resizeImage'
import CoverSearch from '../components/CoverSearch'
import MoveSheet from '../components/MoveSheet'
import Sheet from '../components/Sheet'
import { showToast } from '../lib/toast'
import type { Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { builtinFolderOf, fmtTime, folderOf, SOURCE_LABEL } from '../lib/stories'
import StoryCover from '../components/StoryCover'
import { type QueueFrom, type Sleep, useNowPlaying } from '../lib/nowPlaying'
import { useKid } from '../lib/kidMode'
import { useGlow } from '../lib/glow'

const REMAINING_KEY = 'kt-player-remaining'

// Remount the player for each story, so Previous/Next start from a clean state.
export default function StoryPlayerRoute() {
  const { id } = useParams()
  return <StoryPlayer key={id} />
}

function StoryPlayer() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Back goes to the story's folder: a real history step when we came from it, otherwise open the folder in place.
  const back = () => {
    if ((location.state as { fromFolder?: boolean } | null)?.fromFolder) nav(-1)
    else if (s) nav(`/povesti?folder=${encodeURIComponent(folderOf(s))}`, { replace: true })
    else nav('/povesti', { replace: true })
  }
  const { child } = useSettings()
  const [s, setS] = useState<Story | null>()
  const player = useNowPlaying()
  const [remaining, setRemaining] = useState(() => { try { return localStorage.getItem(REMAINING_KEY) !== '0' } catch { return true } })
  const toggleRemaining = () => setRemaining((r) => { try { localStorage.setItem(REMAINING_KEY, r ? '0' : '1') } catch { /* ignore */ } return !r })
  const [dim, setDim] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [parentsOpen, setParentsOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  // While the finger is on the progress bar we only move the bar; the audio seeks once, on release.
  // Seeking on every move made iOS re-fetch the stream each time and timeupdate pulled the thumb back.
  const [drag, setDrag] = useState<number | null>(null)
  const commitSeek = () => { if (drag !== null) { player.seek(drag); setDrag(null) } }
  const offlineIds = useOfflineIds()
  const online = useOnline()
  // Kid mode: no "Pentru părinți" (delete, cover, offline, move to folder).
  const kid = useKid().active
  const isSaved = !!id && offlineIds.has(id)
  // The whole screen glows in the colours of this story's cover.
  useGlow(s ?? undefined)
  useEffect(() => { getStory(id!).then((x) => setS(x ?? null)).catch(() => setS(null)) }, [id])
  // The audio lives in the app-wide player, so it keeps going when you leave this page.
  const navState = location.state as { autoplay?: boolean; from?: QueueFrom } | null
  const autoplay = !!navState?.autoplay
  const from = navState?.from
  const { load } = player
  useEffect(() => { if (s) load(s, { autoplay, from }) }, [s, load, autoplay, from])
  const toggleFavorite = async () => {
    if (!s) return
    const favorite = !s.favorite
    const next = { ...s, favorite }
    setS(next)
    player.update(next)
    try { await setStoryFavorite(s, favorite) } catch { setS(s); setMsg('Nu am putut salva la favorite.') }
  }
  const current = !!s && player.story?.id === s.id
  const playing = current && player.playing
  const t = current ? player.t : 0
  const dur = current ? player.dur : 0
  const shown = drag ?? t
  const ended = current && player.ended
  const url = current ? player.url : undefined

  // Previous / next come from the app-wide player (same folder; next is random when shuffling).
  const prev = current ? player.prev : undefined
  const next = current ? player.next : undefined
  // When the player moves on to the next story by itself, follow it here.
  const wasCurrent = useRef(false)
  useEffect(() => {
    if (current) { wasCurrent.current = true; return }
    if (wasCurrent.current && player.story) nav(`/povesti/${player.story.id}`, { replace: true, state: location.state })
  }, [current, player.story, nav, location.state])
  const goTo = (to: Story) => {
    // Replace, so Back still returns to the folder rather than walking through every story.
    nav(`/povesti/${to.id}`, { replace: true, state: { ...(location.state as object | null), autoplay: playing } })
  }

  // On the good-night screen, dim further after a while so the room stays dark.
  useEffect(() => {
    if (!ended) return
    const h = setTimeout(() => setDim(true), 20000)
    return () => clearTimeout(h)
  }, [ended])

  if (s === undefined) return <div className="night-player"><p className="loading" role="status"><span className="spinner" aria-hidden="true" /> Se încarcă…</p></div>
  // Full screen, no tab bar: a missing story still needs a way back.
  if (s === null) return (
    <div className="player-missing" role="alert">
      <h1>Povestea nu a fost găsită</h1>
      <p>{online ? 'Poate a fost ștearsă.' : 'Nu e salvată pe acest dispozitiv și nu ai internet acum.'}</p>
      <button type="button" className="moon-btn" onClick={back}>Înapoi la povești</button>
    </div>
  )

  const { toggle, skip, chooseSleep, sleep } = player
  const changeCover = async (make: () => Promise<string>) => {
    setCoverBusy(true); setMsg('')
    try {
      const coverKey = await make()
      await setStoryCover(s, coverKey)
      setS({ ...s, coverKey }); player.update({ ...s, coverKey }); setCoverOpen(false)
    } catch { setMsg('Nu am putut schimba coperta. Încearcă din nou.') }
    setCoverBusy(false)
  }
  const coverFromPhoto = (f: File) => changeCover(async () => {
    const small = await resizeImage(f, 800, 0.85)
    const key = await uploadFile('story-covers', small, 'jpg')
    saveCover(key, small).catch(() => {})
    return key
  })
  const restart = () => { setDim(false); player.restart() }

  if (ended) {
    return (
      <div className={dim ? 'goodnight dim' : 'goodnight'} onClick={() => setDim(false)}>
        <svg width="120" height="120" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="40" fill="var(--moon)" /><circle cx="72" cy="42" r="36" fill="#2b2433" /></svg>
        <h1>Noapte bună{child.name ? `, ${child.name}` : ''}</h1>
        <p>Povestea s-a terminat.<br />Ne auzim data viitoare.</p>
        <div className="goodnight-actions">
          <button className="btn small" onClick={(e) => { e.stopPropagation(); back() }}>Înapoi la povești</button>
          <button className="link-btn" onClick={restart}>Ascultă din nou</button>
        </div>
      </div>
    )
  }

  return (
    <div className="night-player">
      <div className="player-top">
        <button type="button" className="night-btn" aria-label={`Înapoi la ${folderOf(s)}`} onClick={back}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <span className="player-from" aria-hidden="true"><small>Din {folderOf(s)}</small><b>{s.title}</b></span>
        {kid ? <span aria-hidden="true" /> : (
          <button type="button" className="night-btn" aria-label="Pentru părinți: partajare, offline, copertă, folder, ștergere" onClick={() => setParentsOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          </button>
        )}
      </div>
      <StoryCover story={s} className={`player-art${playing ? ' playing' : ''}`} />
      <div className="player-head">
        <div className="player-title">
          <h1>{s.title}</h1>
          <small>{s.collection ? `${s.collection} · ${SOURCE_LABEL[s.source]}` : SOURCE_LABEL[s.source]}</small>
        </div>
        {/* Favourites are the family's list: in kid mode the heart only shows, it can't be changed. */}
        {kid ? (
          s.favorite ? <span className="night-btn fav-btn on fav-static" role="img" aria-label="Preferată"><svg width="22" height="22" viewBox="0 0 24 24" fill={s.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" /></svg></span> : <span className="fav-static" aria-hidden="true" />
        ) : (
          <button type="button" className={`night-btn fav-btn${s.favorite ? ' on' : ''}`} aria-pressed={!!s.favorite}
            aria-label={s.favorite ? 'Scoate din favorite' : 'Pune la favorite'} disabled={!online} onClick={toggleFavorite}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={s.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" /></svg>
          </button>
        )}
      </div>
      <input type="range" className="seek" aria-label="Unde suntem în poveste" min={0} max={dur || 1} step={1} value={Math.min(shown, dur || 1)}
        style={{ ['--p' as string]: dur ? `${(shown / dur) * 100}%` : '0%' }}
        onChange={(e) => setDrag(+e.target.value)}
        onPointerUp={commitSeek} onPointerCancel={commitSeek} onTouchEnd={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} />
      <div className="seek-times"><span>{fmtTime(shown)}</span>
        {dur ? <button type="button" className="time-toggle" onClick={toggleRemaining} aria-label={remaining ? 'Arată durata totală' : 'Arată timpul rămas'}>
          {remaining ? `-${fmtTime(Math.max(0, dur - shown))}` : fmtTime(dur)}
        </button> : <span />}
      </div>
      {current && player.error && <p className="player-error" role="alert">{player.error}</p>}
      <div className="night-controls">
        <button className="track" aria-label={prev ? `Povestea anterioară: ${prev.title}` : 'Povestea anterioară'} disabled={!prev} onClick={() => prev && goTo(prev)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" /><path d="M20 5v14L8.5 12z" fill="currentColor" /></svg>
        </button>
        <button aria-label={`Înapoi ${SKIP} secunde`} onClick={() => skip(-SKIP)}>
          <SkipIcon sec={SKIP} back />
        </button>
        <button className="play" aria-label={playing ? 'Pauză' : 'Pornește'} onClick={toggle} disabled={!url}>
          {playing
            ? <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" /></svg>
            : <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>}
        </button>
        <button aria-label={`Înainte ${SKIP_FWD} de secunde`} onClick={() => skip(SKIP_FWD)}>
          <SkipIcon sec={SKIP_FWD} />
        </button>
        <button className="track" aria-label={next ? `Povestea următoare: ${next.title}` : 'Povestea următoare'} disabled={!next} onClick={() => next && goTo(next)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="17.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" /><path d="M4 5v14l11.5-7z" fill="currentColor" /></svg>
        </button>
      </div>
      {/* Round buttons with a label: tap "Stop după" to cycle 1 → 2 → 3 → 5 stories, the other one to shuffle. */}
      <div className="play-opts">
        <button type="button" className="opt-chip" onClick={player.cycleRate} aria-label={`Viteză ${fmtRate(player.rate)}. Atinge ca să schimbi.`}>
          <span className="opt-icon"><b className="opt-rate">{fmtRate(player.rate)}</b></span>
          <span>Viteză</span>
        </button>
        <button type="button" className="opt-chip" onClick={() => { const all: Sleep[] = [1, 2, 3, 5]; chooseSleep(all[(all.indexOf(sleep) + 1) % all.length]) }}
          aria-label={`Oprește după ${sleep === 1 ? 'o poveste' : `${sleep} povești`}. Atinge ca să schimbi.`}>
          <span className="opt-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
          </span>
          <span>După {sleep === 1 ? '1 poveste' : `${sleep} povești`}</span>
        </button>
        <button type="button" className="opt-chip" aria-pressed={player.shuffle} onClick={player.toggleShuffle} aria-label={player.shuffle ? 'Amestecat. Atinge pentru una după alta.' : 'Una după alta. Atinge ca să amesteci.'}>
          <span className="opt-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>
          </span>
          <span>{player.shuffle ? 'Amestecat' : 'La rând'}</span>
        </button>
      </div>

      {!kid && parentsOpen && <Sheet title="Pentru părinți" onClose={() => setParentsOpen(false)}>
        <div className="parents-body">
          {s.text && <details className="story-text"><summary>Textul poveștii</summary><p>{s.text}</p></details>}
          {s.mine === false && <p className="share-note">De la {s.spaceName ?? 'alt cont'}, doar ascultare.</p>}
          {/* Same-size buttons in two columns; delete spans the full width at the bottom. */}
          <div className="parents-actions">
            {online && s.mine !== false && (
              <button className="btn small span-all share-toggle" aria-pressed={!!s.shared} disabled={sharing} onClick={async () => {
                setSharing(true); setMsg('')
                const shared = !s.shared
                try {
                  await setStoryShared(s, shared)
                  setS({ ...s, shared }); player.update({ ...s, shared })
                  showToast(shared ? 'Povestea e partajată cu toate conturile' : 'Povestea e acum doar în spațiul nostru')
                } catch { setMsg('Nu am putut schimba partajarea. Încearcă din nou.') }
                setSharing(false)
              }}><ShareIcon shared={!!s.shared} />{sharing ? 'Se salvează…' : s.shared ? 'Partajată cu toate conturile' : 'Doar în spațiul nostru'}</button>
            )}
            {isSaved ? (
              <button className="btn small" onClick={() => removeOfflineAudio(s.id)}>Șterge de pe dispozitiv</button>
            ) : online ? (
              <button className="btn small" disabled={saving} onClick={async () => {
                setSaving(true); setMsg('')
                try { await downloadStory(s) } catch { setMsg('Descărcarea a eșuat. Încearcă din nou.') }
                setSaving(false)
              }}>{saving ? 'Se salvează…' : 'Salvează offline'}</button>
            ) : null}
            {online && s.mine !== false && !coverOpen && <button className="btn small" onClick={() => setCoverOpen(true)}>{s.coverKey ? 'Schimbă coperta' : 'Caută o copertă'}</button>}
            {online && s.mine !== false && <button className="btn small span-all" onClick={() => { setParentsOpen(false); setMoveOpen(true) }}>Mută în folder</button>}
            {online && s.mine !== false && (confirmDelete ? (
              <span className="confirm span-all">Ștergi povestea?
                <button className="btn danger small" disabled={deleting} onClick={async () => {
                  setDeleting(true); setMsg('')
                  try {
                    await deleteStory(s)
                    if (current) player.close()
                    // Step back (or open the folder in place), so Back never leads to the deleted story.
                    back()
                  } catch {
                    setMsg('Nu am putut șterge povestea. Verifică internetul și încearcă din nou.')
                    setDeleting(false)
                  }
                }}>{deleting ? 'Se șterge…' : 'Da, șterge'}</button>
                <button className="btn small" onClick={() => setConfirmDelete(false)}>Nu</button>
              </span>
            ) : <button className="btn danger small span-all" onClick={() => setConfirmDelete(true)}>Șterge povestea</button>)}
          </div>
          {online && coverOpen && (
            <div className="cover-change">
              {coverBusy ? <p className="importing"><span className="spinner" /> Salvez coperta…</p> : (
                <>
                  <CoverSearch title={s.title} auto onPick={(c) => changeCover(() => saveFoundCover(c.url))} />
                  <div className="row">
                    <label className="btn small file-btn">Alege o poză
                      <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) coverFromPhoto(f) }} />
                    </label>
                    <button className="btn small" onClick={() => setCoverOpen(false)}>Renunță</button>
                  </div>
                </>
              )}
            </div>
          )}
          {isSaved && <small>Salvată pe acest dispozitiv, merge și fără internet.</small>}
          {!online && <p className="parents-offline">Fără internet poți asculta poveștile salvate. Coperta, mutarea și ștergerea revin când ai din nou internet.</p>}
          {msg && <p className="error">{msg}</p>}
        </div>
      </Sheet>}
      {moveOpen && !kid && (
        <MoveSheet story={s} onClose={() => setMoveOpen(false)} onMoved={(collection, shared, changed) => {
          const moved = { ...s, collection, shared: shared ?? s.shared }
          setS(moved); player.update(moved)
          // Say so when the folder changed who can see the story.
          showToast(`Mutată în ${collection ?? builtinFolderOf(s)}${changed ? (moved.shared ? ' · acum e partajată cu toate conturile' : ' · acum e doar în spațiul nostru') : ''}`)
        }} />
      )}
    </div>
  )
}

/** "1×", "1,25×". */
const fmtRate = (r: number) => `${String(r).replace('.', ',')}×`

/** Seconds jumped by the skip buttons: back a little, forward a bit more. */
const SKIP = 15
const SKIP_FWD = 30

/** A curved arrow around the number of seconds it skips (mirrored for "back"). */
function SkipIcon({ sec, back }: { sec: number; back?: boolean }) {
  return (
    <svg className="skip-icon" width="46" height="46" viewBox="0 0 44 44" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform={back ? 'matrix(-1 0 0 1 44 0)' : undefined}>
        <path d="M22 10A14 14 0 1 0 34.1 17" />
        <path d="M22 10h3" />
        <path d="M24.5 4.8 31 10l-6.5 5.2z" fill="currentColor" strokeWidth="1.2" />
      </g>
      <text x="22" y="25" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="13" fontWeight="800">{sec}</text>
    </svg>
  )
}
