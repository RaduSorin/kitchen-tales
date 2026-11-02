import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { deleteStory, downloadStory, getOfflineAudio, getStory, listStories, removeOfflineAudio, saveFoundCover, setStoryCover, uploadFile } from '../lib/db'
import { saveCover } from '../lib/offline'
import { resizeImage } from '../lib/resizeImage'
import CoverSearch from '../components/CoverSearch'
import type { Story } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { useFileUrl } from '../lib/useFileUrl'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, folderOf, getPosition, SOURCE_LABEL, setPosition } from '../lib/stories'
import StoryCover from '../components/StoryCover'
import { useCoverUrl } from '../lib/useCoverUrl'
import { storyArtwork } from '../lib/artwork'

type Sleep = 'end' | 15 | 30
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
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [remaining, setRemaining] = useState(() => { try { return localStorage.getItem(REMAINING_KEY) === '1' } catch { return false } })
  const toggleRemaining = () => setRemaining((r) => { try { localStorage.setItem(REMAINING_KEY, r ? '0' : '1') } catch { /* ignore */ } return !r })
  const [sleep, setSleep] = useState<Sleep>('end')
  const sleepLeft = useRef(0) // ms of listening left before the sleep timer stops the story
  const sleepReset = useRef(false)
  const [ended, setEnded] = useState(false)
  const [dim, setDim] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const [localAudio, setLocalAudio] = useState<Blob>()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState('')
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const offlineIds = useOfflineIds()
  const online = useOnline()
  const isSaved = !!id && offlineIds.has(id)
  useEffect(() => { getStory(id!).then((x) => setS(x ?? null)).catch(() => setS(null)) }, [id])
  useEffect(() => { getOfflineAudio(id!).then(setLocalAudio).catch(() => {}) }, [id, isSaved])
  const localUrl = useBlobUrl(localAudio)
  const remoteUrl = useFileUrl(localAudio ? undefined : s?.audioKey)
  const url = localUrl ?? remoteUrl

  // Previous / next story in the same folder, in shelf order (offline: only stories saved on this device).
  const [siblings, setSiblings] = useState<Story[]>([])
  useEffect(() => {
    if (!s) return
    listStories().then((all) => setSiblings(all.filter((x) => folderOf(x) === folderOf(s)))).catch(() => {})
  }, [s])
  const playable = online ? siblings : siblings.filter((x) => offlineIds.has(x.id))
  const idx = playable.findIndex((x) => x.id === id)
  const prev = idx > 0 ? playable[idx - 1] : undefined
  const next = idx >= 0 && idx < playable.length - 1 ? playable[idx + 1] : undefined
  const autoplay = !!(location.state as { autoplay?: boolean } | null)?.autoplay
  const goTo = (to: Story) => {
    if (audio.current && s) setPosition(s.id, audio.current.currentTime)
    // Replace, so Back still returns to the folder rather than walking through every story.
    nav(`/povesti/${to.id}`, { replace: true, state: { ...(location.state as object | null), autoplay: playing } })
  }

  // Lock-screen / headphone controls, with the story's cover as the Now Playing artwork.
  const coverUrl = useCoverUrl(s?.coverKey)
  useEffect(() => {
    if (!s || !('mediaSession' in navigator)) return
    let live = true
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: 'Kitchen Tales' })
    storyArtwork(s, coverUrl).then((src) => {
      if (!live || !src) return
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.title, artist: 'Kitchen Tales', artwork: [{ src, sizes: '512x512', type: 'image/png' }],
      })
    }).catch(() => {})
    return () => { live = false }
  }, [s, coverUrl])

  // Sleep timer: stop after 15 or 30 minutes of listening (paused time doesn't count).
  useEffect(() => {
    if (sleep === 'end' || !playing) return
    const started = Date.now()
    const h = setTimeout(() => { audio.current?.pause(); setEnded(true) }, sleepLeft.current)
    return () => {
      clearTimeout(h)
      if (sleepReset.current) sleepReset.current = false
      else sleepLeft.current = Math.max(0, sleepLeft.current - (Date.now() - started))
    }
  }, [sleep, playing])

  // On the good-night screen, dim further after a while so the room stays dark.
  useEffect(() => {
    if (!ended) return
    const h = setTimeout(() => setDim(true), 20000)
    return () => clearTimeout(h)
  }, [ended])

  if (s === undefined) return <div className="night-player" />
  if (s === null) return <p className="empty">Povestea nu a fost găsită{online ? '' : ' pe acest dispozitiv'}.</p>

  const toggle = () => { const a = audio.current!; if (a.paused) a.play(); else a.pause() }
  const skip = (d: number) => { const a = audio.current!; a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }
  const chooseSleep = (v: Sleep) => { sleepLeft.current = v === 'end' ? 0 : v * 60000; sleepReset.current = playing && sleep !== 'end'; setSleep(v) }
  const changeCover = async (make: () => Promise<string>) => {
    setCoverBusy(true); setMsg('')
    try {
      const coverKey = await make()
      await setStoryCover(s, coverKey)
      setS({ ...s, coverKey }); setCoverOpen(false)
    } catch { setMsg('Nu am putut schimba coperta. Încearcă din nou.') }
    setCoverBusy(false)
  }
  const coverFromPhoto = (f: File) => changeCover(async () => {
    const small = await resizeImage(f, 800, 0.85)
    const key = await uploadFile('story-covers', small, 'jpg')
    saveCover(key, small).catch(() => {})
    return key
  })
  const restart = () => { setEnded(false); setDim(false); const a = audio.current!; a.currentTime = 0; a.play() }

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
      </div>
      <StoryCover story={s} round className={playing ? 'playing' : ''} />
      <div className="player-title">
        <h1>{s.title}</h1>
        <small>{SOURCE_LABEL[s.source]}</small>
      </div>
      <audio ref={audio} src={url}
        onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setPosition(s.id, audio.current?.currentTime) }}
        onEnded={() => { setPlaying(false); setPosition(s.id, undefined); setEnded(true) }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          setDur(isFinite(a.duration) ? a.duration : 0)
          const pos = getPosition(s.id)
          if (pos && (!isFinite(a.duration) || pos < a.duration - 5)) a.currentTime = pos
          if (autoplay) a.play().catch(() => {})
        }} />
      <input type="range" className="seek" aria-label="Unde suntem în poveste" min={0} max={dur || 1} step={1} value={Math.min(t, dur || 1)}
        style={{ ['--p' as string]: dur ? `${(t / dur) * 100}%` : '0%' }}
        onChange={(e) => { if (audio.current) audio.current.currentTime = +e.target.value }} />
      <div className="seek-times"><span>{fmtTime(t)}</span>
        {dur ? <button type="button" className="time-toggle" onClick={toggleRemaining} aria-label={remaining ? 'Arată durata totală' : 'Arată timpul rămas'}>
          {remaining ? `-${fmtTime(Math.max(0, dur - t))}` : fmtTime(dur)}
        </button> : <span />}
      </div>
      <div className="night-controls">
        <button className="track" aria-label={prev ? `Povestea anterioară: ${prev.title}` : 'Povestea anterioară'} disabled={!prev} onClick={() => prev && goTo(prev)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" /><path d="M20 5v14L8.5 12z" fill="currentColor" /></svg>
        </button>
        <button aria-label="Înapoi 15 secunde" onClick={() => skip(-15)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" /></svg>
        </button>
        <button className="play" aria-label={playing ? 'Pauză' : 'Pornește'} onClick={toggle} disabled={!url}>
          {playing
            ? <svg width="38" height="38" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" /></svg>
            : <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>}
        </button>
        <button aria-label="Înainte 15 secunde" onClick={() => skip(15)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v4h-4" /></svg>
        </button>
        <button className="track" aria-label={next ? `Povestea următoare: ${next.title}` : 'Povestea următoare'} disabled={!next} onClick={() => next && goTo(next)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="17.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" /><path d="M4 5v14l11.5-7z" fill="currentColor" /></svg>
        </button>
      </div>
      <div className="sleep" role="group" aria-label="Oprește după">
        <span>Oprește după</span>
        {([['end', 'poveste'], [15, '15 min'], [30, '30 min']] as [Sleep, string][]).map(([v, label]) => (
          <button key={v} aria-pressed={sleep === v} onClick={() => chooseSleep(v)}>{label}</button>
        ))}
      </div>

      <details className="parents">
        <summary>Pentru părinți</summary>
        <div className="parents-body">
          {s.text && <details className="story-text"><summary>Textul poveștii</summary><p>{s.text}</p></details>}
          <div className="row">
            {isSaved ? (
              <button className="btn small" onClick={() => removeOfflineAudio(s.id).then(() => setLocalAudio(undefined))}>Șterge de pe dispozitiv</button>
            ) : online ? (
              <button className="btn small" disabled={saving} onClick={async () => {
                setSaving(true); setMsg('')
                try { await downloadStory(s) } catch { setMsg('Descărcarea a eșuat. Încearcă din nou.') }
                setSaving(false)
              }}>{saving ? 'Se salvează…' : 'Salvează pentru offline'}</button>
            ) : null}
            {online && (confirmDelete ? (
              <span className="confirm">Ștergi povestea?
                <button className="btn danger small" onClick={async () => { await deleteStory(s); nav('/povesti') }}>Da, șterge</button>
                <button className="btn small" onClick={() => setConfirmDelete(false)}>Nu</button>
              </span>
            ) : <button className="btn danger small" onClick={() => setConfirmDelete(true)}>Șterge povestea</button>)}
          </div>
          {online && (coverOpen ? (
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
          ) : <button className="btn small" onClick={() => setCoverOpen(true)}>{s.coverKey ? 'Schimbă coperta' : 'Caută o copertă'}</button>)}
          {isSaved && <small>Salvată pe acest dispozitiv, merge și fără internet.</small>}
          {msg && <p className="error">{msg}</p>}
        </div>
      </details>
    </div>
  )
}
