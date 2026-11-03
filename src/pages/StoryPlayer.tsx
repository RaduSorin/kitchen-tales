import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { deleteStory, downloadStory, getStory, removeOfflineAudio, saveFoundCover, setStoryCover, uploadFile, setStoryFavorite } from '../lib/db'
import { saveCover } from '../lib/offline'
import { resizeImage } from '../lib/resizeImage'
import CoverSearch from '../components/CoverSearch'
import type { Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, folderOf, SOURCE_LABEL } from '../lib/stories'
import StoryCover from '../components/StoryCover'
import { type QueueFrom, type Sleep, useNowPlaying } from '../lib/nowPlaying'

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
  const [remaining, setRemaining] = useState(() => { try { return localStorage.getItem(REMAINING_KEY) === '1' } catch { return false } })
  const toggleRemaining = () => setRemaining((r) => { try { localStorage.setItem(REMAINING_KEY, r ? '0' : '1') } catch { /* ignore */ } return !r })
  const [dim, setDim] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState('')
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const offlineIds = useOfflineIds()
  const online = useOnline()
  const isSaved = !!id && offlineIds.has(id)
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
        <svg width="120" height="120" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="40" fill="var(--moon)" /><circle cx="72" cy="42" r="36" fill="#161a46" /></svg>
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className={`night-btn fav-btn${s.favorite ? ' on' : ''}`} aria-pressed={!!s.favorite}
          aria-label={s.favorite ? 'Scoate din favorite' : 'Pune la favorite'} disabled={!online} onClick={toggleFavorite}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={s.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" /></svg>
        </button>
      </div>
      <StoryCover story={s} round className={playing ? 'playing' : ''} />
      <div className="player-title">
        <h1>{s.title}</h1>
        <small>{SOURCE_LABEL[s.source]}</small>
      </div>
      <input type="range" className="seek" aria-label="Unde suntem în poveste" min={0} max={dur || 1} step={1} value={Math.min(t, dur || 1)}
        style={{ ['--p' as string]: dur ? `${(t / dur) * 100}%` : '0%' }}
        onChange={(e) => player.seek(+e.target.value)} />
      <div className="seek-times"><span>{fmtTime(t)}</span>
        {dur ? <button type="button" className="time-toggle" onClick={toggleRemaining} aria-label={remaining ? 'Arată durata totală' : 'Arată timpul rămas'}>
          {remaining ? `-${fmtTime(Math.max(0, dur - t))}` : fmtTime(dur)}
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
        <button aria-label={`Înainte ${SKIP} secunde`} onClick={() => skip(SKIP)}>
          <SkipIcon sec={SKIP} />
        </button>
        <button className="track" aria-label={next ? `Povestea următoare: ${next.title}` : 'Povestea următoare'} disabled={!next} onClick={() => next && goTo(next)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="17.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" /><path d="M4 5v14l11.5-7z" fill="currentColor" /></svg>
        </button>
      </div>
      {/* One compact row: tap the left chip to cycle 1 → 2 → 3 → 5 stories, the right one to shuffle. */}
      <div className="play-opts">
        <button type="button" className="opt-chip" onClick={() => { const all: Sleep[] = [1, 2, 3, 5]; chooseSleep(all[(all.indexOf(sleep) + 1) % all.length]) }}
          aria-label={`Oprește după ${sleep === 1 ? 'o poveste' : `${sleep} povești`}. Atinge ca să schimbi.`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
          <span>Stop după <b>{sleep}</b></span>
        </button>
        <button type="button" className="opt-chip" aria-pressed={player.shuffle} onClick={player.toggleShuffle} aria-label={player.shuffle ? 'Amestecat. Atinge pentru una după alta.' : 'Una după alta. Atinge ca să amesteci.'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>
          <span>{player.shuffle ? 'Amestecat' : 'La rând'}</span>
        </button>
      </div>

      <details className="parents">
        <summary>Pentru părinți</summary>
        <div className="parents-body">
          {s.text && <details className="story-text"><summary>Textul poveștii</summary><p>{s.text}</p></details>}
          {/* Same-size buttons in two columns; delete spans the full width at the bottom. */}
          <div className="parents-actions">
            {isSaved ? (
              <button className="btn small" onClick={() => removeOfflineAudio(s.id)}>Șterge de pe dispozitiv</button>
            ) : online ? (
              <button className="btn small" disabled={saving} onClick={async () => {
                setSaving(true); setMsg('')
                try { await downloadStory(s) } catch { setMsg('Descărcarea a eșuat. Încearcă din nou.') }
                setSaving(false)
              }}>{saving ? 'Se salvează…' : 'Salvează offline'}</button>
            ) : null}
            {online && !coverOpen && <button className="btn small" onClick={() => setCoverOpen(true)}>{s.coverKey ? 'Schimbă coperta' : 'Caută o copertă'}</button>}
            {online && (confirmDelete ? (
              <span className="confirm span-all">Ștergi povestea?
                <button className="btn danger small" onClick={async () => { if (current) player.close(); await deleteStory(s); nav('/povesti') }}>Da, șterge</button>
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
          {msg && <p className="error">{msg}</p>}
        </div>
      </details>
    </div>
  )
}

/** Seconds jumped by the skip buttons. */
const SKIP = 15

/** A curved arrow around the number of seconds it skips (mirrored for "back"). */
function SkipIcon({ sec, back }: { sec: number; back?: boolean }) {
  return (
    <svg className="skip-icon" width="46" height="46" viewBox="0 0 44 44" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform={back ? 'matrix(-1 0 0 1 44 0)' : undefined}>
        <path d="M22 7A15 15 0 1 1 9 14.5" />
        <path d="M22 3 26.5 7 22 11" />
      </g>
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="14" fontWeight="800">{sec}</text>
    </svg>
  )
}
