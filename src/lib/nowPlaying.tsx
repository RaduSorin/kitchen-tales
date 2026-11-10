import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Story } from './types'
import { fileUrl, getOfflineAudio, watchStories } from './db'
import { folderOf, getPosition, markPlayed, setPosition } from './stories'
import { useOfflineIds, useOnline } from './useOffline'
import { useCoverUrl } from './useCoverUrl'
import { storyArtwork } from './artwork'
import { isKidLocked } from './kidMode'

/** How many stories to play in a row before stopping. */
export type Sleep = 1 | 2 | 3 | 5
const SLEEP_KEY = 'kt-stop-after'
const SHUFFLE_KEY = 'kt-shuffle'
const RATE_KEY = 'kt-play-rate'
/** Playback speeds, in the order the Viteză button goes through them. */
const RATES = [1, 1.25, 1.5, 0.75] as const
const readNum = (k: string, d: number) => { try { return +(localStorage.getItem(k) ?? d) || d } catch { return d } }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

interface NowPlaying {
  story?: Story
  url?: string
  playing: boolean
  t: number
  dur: number
  ended: boolean
  /** Why the current story cannot play (no internet and not saved here, or a broken file). */
  error?: string
  sleep: Sleep
  shuffle: boolean
  /** The previous / next story in the current folder (next is random when shuffling). */
  prev?: Story
  next?: Story
  /** Start (or keep) this story in the app-wide player. Loading the story already playing does nothing. */
  load: (story: Story, opts?: { autoplay?: boolean; continued?: boolean; from?: QueueFrom }) => void
  /** Update the current story's details (e.g. a new cover) without touching playback. */
  update: (story: Story) => void
  toggle: () => void
  skip: (sec: number) => void
  seek: (sec: number) => void
  restart: () => void
  chooseSleep: (v: Sleep) => void
  toggleShuffle: () => void
  /** Playback speed (1 = normal), remembered on this device. */
  rate: number
  /** Next speed: 1 → 1.25 → 1.5 → 0.75 → 1. */
  cycleRate: () => void
  /** Stop and forget the current story (closes the mini player). */
  close: () => void
  /** Turns the sound down over a few seconds, then pauses (kid mode's time is up). */
  fadeOut: () => Promise<void>
}

/** Where "next" comes from: the story's folder, or the Favorite list when started from there. */
export type QueueFrom = 'folder' | 'favorites'

const NOT_REACHABLE = 'Povestea nu e salvată pe acest dispozitiv și nu o pot descărca acum. Verifică internetul.'
const BROKEN_FILE = 'Nu pot reda povestea salvată pe acest dispozitiv. Șterge-o de pe dispozitiv și salveaz-o din nou.'

const Ctx = createContext<NowPlaying | null>(null)

export function useNowPlaying() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNowPlaying outside NowPlayingProvider')
  return v
}

/**
 * One <audio> element for the whole app, so a story keeps playing while you browse the shelf,
 * recipes or settings. The player page and the mini player are just views of it.
 */
export function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [story, setStory] = useState<Story>()
  const [url, setUrl] = useState<string>()
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string>()
  // Whether the current audio comes from this device (true) or from the internet (false).
  const fromDevice = useRef(false)
  // When the internet link was signed: it stops working after an hour (the sign-in's credentials
  // expire), so a story paused longer than that gets a fresh link before it plays again.
  const signedAt = useRef(0)
  const resigned = useRef(false)
  const [sleep, setSleep] = useState<Sleep>(() => ([1, 2, 3, 5].includes(readNum(SLEEP_KEY, 1)) ? readNum(SLEEP_KEY, 1) : 1) as Sleep)
  const [shuffle, setShuffle] = useState(() => readNum(SHUFFLE_KEY, 0) === 1)
  const [rate, setRate] = useState(() => { const r = readNum(RATE_KEY, 1); return (RATES as readonly number[]).includes(r) ? r : 1 })
  const cycleRate = useCallback(() => setRate((r) => {
    const n = RATES[(RATES.indexOf(r as typeof RATES[number]) + 1) % RATES.length]
    store(RATE_KEY, String(n))
    return n
  }), [])
  // A new source resets the speed in some browsers, so it is set again whenever the audio changes.
  useEffect(() => { const a = audio.current; if (a) { a.defaultPlaybackRate = rate; a.playbackRate = rate } }, [rate, url])
  const played = useRef(0) // stories finished in this run, for "stop after N stories"
  const heard = useRef(new Set<string>()) // stories already played in this run, so shuffle doesn't repeat
  const autoplay = useRef(false)
  // Set while a story that should play on its own has been asked to play but has not started yet.
  const starting = useRef(false)
  const storyRef = useRef<Story>(undefined)
  storyRef.current = story

  // The current folder, in shelf order (offline: only stories saved on this device).
  const online = useOnline()
  const offlineIds = useOfflineIds()
  const [folder, setFolder] = useState<Story[]>([])
  const [from, setFrom] = useState<QueueFrom>('folder')
  const folderName = story ? folderOf(story) : undefined
  const isFav = !!story?.favorite
  // From this device's copy at once (the next story is known even on a weak signal), then the server's.
  useEffect(() => {
    if (!folderName) return
    return watchStories((all) => {
      // Started from Favorite: shuffle and "stop after N" stay within the favourites (sorted like that page).
      setFolder(from === 'favorites'
        ? all.filter((x) => x.favorite).sort((a, b) => a.title.localeCompare(b.title, 'ro'))
        : all.filter((x) => folderOf(x) === folderName))
    })
  }, [folderName, from, isFav])
  const queue = online ? folder : folder.filter((x) => offlineIds.has(x.id))
  const idx = story ? queue.findIndex((x) => x.id === story.id) : -1
  const prev = idx > 0 ? queue[idx - 1] : undefined
  // Shuffle picks one random unheard story; the pick stays fixed until the story changes.
  const [shufflePick, setShufflePick] = useState<{ for?: string; pick?: Story }>({})
  useEffect(() => {
    if (!shuffle || !story) return
    const pool = queue.filter((x) => x.id !== story.id && !heard.current.has(x.id))
    const from = pool.length ? pool : queue.filter((x) => x.id !== story.id)
    setShufflePick({ for: story.id, pick: from[Math.floor(Math.random() * from.length)] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, story?.id, queue.length])
  const next = shuffle
    ? (shufflePick.for === story?.id ? shufflePick.pick : undefined)
    : idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : undefined
  const nextRef = useRef<Story>(undefined)
  nextRef.current = next
  const prevRef = useRef<Story>(undefined)
  prevRef.current = prev
  const sleepRef = useRef(sleep)
  sleepRef.current = sleep

  // Resolve the audio: the copy saved on this device, otherwise a signed S3 link.
  useEffect(() => {
    if (!story) { setUrl(undefined); return }
    let live = true
    let blobUrl: string | undefined
    setUrl(undefined)
    setError(undefined)
    ;(async () => {
      const blob = await getOfflineAudio(story.id).catch(() => undefined)
      if (!live) return
      fromDevice.current = !!blob
      if (blob) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl) }
      else if (story.audioKey) { const u = await fileUrl(story.audioKey); if (live) { signedAt.current = Date.now(); resigned.current = false; setUrl(u) } }
    })().catch(() => { if (live) setError(NOT_REACHABLE) })
    return () => { live = false; if (blobUrl) URL.revokeObjectURL(blobUrl) }
    // Only a different story needs new audio; cover or title edits keep playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  const load = useCallback((s: Story, opts?: { autoplay?: boolean; continued?: boolean; from?: QueueFrom }) => {
    const cur = storyRef.current
    if (!opts?.continued) setFrom(opts?.from ?? 'folder')
    if (cur?.id === s.id) {
      setStory(s)
      // Already loaded but paused (e.g. "Continuă" on the story in the mini player): play it now.
      const a = audio.current
      if (opts?.autoplay && a && a.paused && a.src && !isKidLocked()) a.play().catch(() => {})
      return
    }
    // A story you pick yourself starts a new run; one that follows on its own continues it.
    if (!opts?.continued) { played.current = 0; heard.current = new Set() }
    heard.current.add(s.id)
    markPlayed(s.id)
    // A story that finished keeps no place (onEnded cleared it), so it isn't shown as half-heard.
    if (cur && audio.current && !audio.current.ended) setPosition(cur.id, audio.current.currentTime)
    // A story that follows on its own (queue, next/previous buttons) starts from the beginning,
    // even if it was left halfway before: in a run of stories, jumping into the middle is confusing,
    // and with the phone locked there is then no seek before it starts.
    if (opts?.continued) setPosition(s.id, undefined)
    autoplay.current = !!opts?.autoplay
    starting.current = false
    setT(0); setDur(0); setEnded(false); setPlaying(false)
    setStory(s)
  }, [])

  /**
   * Swaps in a freshly signed link for the current internet story, keeping the place
   * (loadedmetadata seeks back to the saved position) and playing on if asked.
   */
  const resign = useCallback(async (play: boolean) => {
    const a = audio.current
    const cur = storyRef.current
    if (!a || !cur?.audioKey || fromDevice.current) return false
    setPosition(cur.id, a.currentTime)
    try {
      const u = await fileUrl(cur.audioKey)
      if (storyRef.current?.id !== cur.id || u === a.src) return false
      signedAt.current = Date.now()
      autoplay.current = play
      setError(undefined)
      setUrl(u)
      return true
    } catch { return false }
  }, [])
  // Play, first renewing an internet link that is about to expire (50 min, before the hour is up).
  const play = useCallback(() => {
    const a = audio.current
    if (!a || isKidLocked()) return
    setEnded(false)
    if (!fromDevice.current && signedAt.current && Date.now() - signedAt.current > 50 * 60_000) {
      resign(true).then((ok) => { if (!ok) a.play().catch(() => {}) })
      return
    }
    a.play().catch(() => {})
  }, [resign])

  const update = useCallback((s: Story) => { if (storyRef.current?.id === s.id) setStory(s) }, [])
  const toggle = useCallback(() => { const a = audio.current; if (!a) return; if (a.paused) play(); else a.pause() }, [play])
  const skip = useCallback((d: number) => { const a = audio.current; if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }, [])
  const seek = useCallback((sec: number) => { if (audio.current) { audio.current.currentTime = sec; setT(sec) } }, [])
  const restart = useCallback(() => { const a = audio.current; if (!a || isKidLocked()) return; setEnded(false); a.currentTime = 0; a.play().catch(() => {}) }, [])
  // iPhone ignores the volume set by a web page, so there it simply pauses at the end of the fade.
  const fadeOut = useCallback(async () => {
    const a = audio.current
    if (!a || a.paused) return
    const start = a.volume
    for (let i = 1; i <= 16 && !a.paused; i++) {
      await new Promise((r) => setTimeout(r, 500))
      a.volume = Math.max(0, start * (1 - i / 16))
    }
    a.pause()
    a.volume = start
  }, [])
  const chooseSleep = (v: Sleep) => { played.current = 0; setSleep(v); store(SLEEP_KEY, String(v)) }
  const toggleShuffle = () => setShuffle((x) => { store(SHUFFLE_KEY, x ? '0' : '1'); return !x })
  const close = useCallback(() => {
    const a = audio.current
    const cur = storyRef.current
    if (a && cur) { a.pause(); setPosition(cur.id, a.currentTime) }
    // Unload the audio too: a paused element that still holds a source keeps the iPhone lock-screen player alive.
    if (a) { a.removeAttribute('src'); a.load() }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    setStory(undefined); setEnded(false); played.current = 0
  }, [])

  // Lock-screen / headphone buttons: play, pause, next and previous story. None when nothing is loaded.
  const hasStory = !!story
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, h: MediaSessionActionHandler | null) => { try { ms.setActionHandler(action, h) } catch { /* unsupported action */ } }
    const actions: MediaSessionAction[] = ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'nexttrack', 'previoustrack']
    if (!hasStory) { actions.forEach((x) => set(x, null)); return }
    set('play', play)
    set('pause', () => audio.current?.pause())
    // No 15 s skips here: iOS shows those instead of next/previous story when both are set, and on the
    // lock screen the story buttons are wanted. The scrubber (seekto) still moves within the story.
    set('seekbackward', null)
    set('seekforward', null)
    set('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime) })
    // Headphones (double / triple press) and car stereos: next and previous story of the folder.
    set('nexttrack', () => { const n = nextRef.current; if (n && !isKidLocked()) load(n, { autoplay: true, continued: true }) })
    set('previoustrack', () => {
      const a = audio.current
      // Like music apps: a few seconds in, "previous" starts the story again.
      if (a && a.currentTime > 5) { a.currentTime = 0; return }
      const p = prevRef.current
      if (p && !isKidLocked()) load(p, { autoplay: true, continued: true })
    })
    return () => actions.forEach((x) => set(x, null))
  }, [hasStory, seek, play, load])

  // Lock-screen / headphone controls, with the story's cover as the Now Playing artwork.
  const coverUrl = useCoverUrl(story?.coverKey)
  // Car stereos (Bluetooth) often read the cover only once, with the first title they get, so the
  // metadata is set once with its artwork: we wait for the cover (at most ~1.5 s) instead of sending
  // a title without a picture first and the picture later.
  const artKey = story ? `${story.id}|${story.title}|${story.emoji ?? ''}|${story.scene ?? ''}` : ''
  const waitCover = !!story?.coverKey && !coverUrl
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const s = storyRef.current
    if (!artKey || !s) {
      // iOS keeps the last audio app on the lock screen for a while even after it stops. With no
      // metadata it draws our icon on a white tile (white corners), so give it the full square icon.
      ms.metadata = new MediaMetadata({ title: 'Bucătăria cu povești', artwork: [{ src: new URL('/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }] })
      ms.playbackState = 'none'
      return
    }
    let live = true
    const plain = () => { if (live && ms.metadata?.title !== s.title) ms.metadata = new MediaMetadata({ title: s.title, artist: 'Bucătăria cu povești' }) }
    const show = (cover?: string) => storyArtwork(s, cover).then((src) => {
      if (!live) return
      if (!src) { plain(); return }
      ms.metadata = new MediaMetadata({
        title: s.title, artist: 'Bucătăria cu povești', artwork: [{ src, sizes: '512x512', type: 'image/jpeg' }],
      })
    }).catch(plain)
    // Cover still loading (or failing): after a moment, show the emoji tile rather than nothing.
    const fallback = waitCover ? setTimeout(() => { if (ms.metadata?.title !== s.title) show() }, 1500) : undefined
    if (!waitCover) show(coverUrl)
    return () => { live = false; clearTimeout(fallback) }
  }, [artKey, coverUrl, waitCover])

  // When a story ends: play the next one until the chosen number of stories is reached.
  const onEnded = () => {
    setPlaying(false)
    if (storyRef.current) setPosition(storyRef.current.id, undefined)
    played.current += 1
    const following = nextRef.current
    if (following && played.current < sleepRef.current && !isKidLocked()) load(following, { autoplay: true, continued: true })
    else { played.current = 0; setEnded(true) }
  }

  // Only errors of the current source count; a previous story's revoked link may still report one.
  const onError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!url || e.currentTarget.src !== url) return
    setPlaying(false)
    // An internet link that stopped working (expired): sign it again once and carry on.
    if (!fromDevice.current && !resigned.current && navigator.onLine) {
      resigned.current = true
      const wasPlaying = !e.currentTarget.paused || playing
      resign(wasPlaying).then((ok) => { if (!ok) setError(NOT_REACHABLE) })
      return
    }
    setError(fromDevice.current ? BROKEN_FILE : NOT_REACHABLE)
  }

  const value: NowPlaying = { story, url, playing, t, dur, ended, error, sleep, shuffle, prev, next, load, update, toggle, skip, seek, restart, chooseSleep, toggleShuffle, rate, cycleRate, close, fadeOut }
  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audio} src={url}
        onError={onError}
        onPlay={(e) => {
          // Time is up in kid mode: nothing plays, not even from the lock-screen or headphone buttons.
          if (isKidLocked()) { e.currentTarget.pause(); return }
          starting.current = false
          setPlaying(true); setEnded(false); setError(undefined); resigned.current = false
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' }}
        onPause={(e) => { setPlaying(false); if ('mediaSession' in navigator && e.currentTarget.src) navigator.mediaSession.playbackState = 'paused'; if (storyRef.current) setPosition(storyRef.current.id, audio.current?.currentTime) }}
        onEnded={onEnded}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          a.playbackRate = rate
          setDur(isFinite(a.duration) ? a.duration : 0)
          const cur = storyRef.current
          const pos = cur ? getPosition(cur.id) : 0
          const resume = !!pos && (!isFinite(a.duration) || pos < a.duration - 5)
          if (autoplay.current && !isKidLocked()) {
            autoplay.current = false
            // Play first, then jump to the saved place. With the phone locked, iOS does not fetch
            // audio for a paused element, so seeking a story that was left halfway before playing it
            // left the queue stuck on that story: the seek waited for data and play() never started.
            starting.current = true
            a.play().catch(() => {})
            if (resume) a.currentTime = pos
            // If it still has not started after a few seconds, ask once more.
            const src = a.src
            setTimeout(() => { if (starting.current && a.src === src && a.paused && !isKidLocked()) a.play().catch(() => {}) }, 4000)
          } else if (resume) a.currentTime = pos
        }} />
    </Ctx.Provider>
  )
}
