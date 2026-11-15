import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Story } from './types'
import { fileUrl, getOfflineAudio, watchStories } from './db'
import { folderOf, getPosition, markPlayed, setPosition } from './stories'
import { useOfflineIds, useOnline } from './useOffline'
import { loadCoverBlob } from './useCoverUrl'
import { storyArtwork } from './artwork'
import { isKidLocked, isKidMode, kidAllowsFolder, useKid } from './kidMode'
import { addLast, loadQueue, playNext as queueFirst, type QueuedStory, type QueueResult, removeFrom, moveTo, saveQueue } from './upNext'
import { track } from './badges/store'

/** How many stories to play in a row before stopping. */
export type Sleep = 1 | 2 | 3 | 5
const SLEEP_KEY = 'kt-stop-after'
const SHUFFLE_KEY = 'kt-shuffle'
const RATE_KEY = 'kt-play-rate'
/** Playback speeds, in the order the Viteză button goes through them. */
const RATES = [1, 1.25, 1.5, 0.75] as const
const readNum = (k: string, d: number) => { try { return +(localStorage.getItem(k) ?? d) || d } catch { return d } }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

/*
 * The Now Playing picture (lock screen, and over Bluetooth the car's screen). Car stereos often
 * read the picture only once, when the track starts, so it is made as early as possible: when a
 * story is picked, and the next one's while the current one plays. The metadata then goes out
 * with its picture before play() is called.
 */
const artKeyOf = (s: Story) => `${s.id}|${s.title}|${s.emoji ?? ''}|${s.scene ?? ''}|${s.coverKey ?? ''}`
const artMaking = new Map<string, Promise<string | undefined>>()
/** Finished pictures (a data: URL, or undefined when none could be made), for a synchronous look. */
const artMade = new Map<string, string | undefined>()
function prepareArt(s: Story): Promise<string | undefined> {
  const key = artKeyOf(s)
  const running = artMaking.get(key)
  if (running) return running
  if (artMaking.size > 12) { artMaking.clear(); artMade.clear() }
  const made = (async () => {
    const blob = s.coverKey ? await loadCoverBlob(s.coverKey).catch(() => undefined) : undefined
    const url = blob ? URL.createObjectURL(blob) : undefined
    try { return await storyArtwork(s, url) } finally { if (url) URL.revokeObjectURL(url) }
  })().catch(() => undefined)
  made.then((src) => artMade.set(key, src))
  artMaking.set(key, made)
  return made
}
function storyMetadata(s: Story, src?: string) {
  return new MediaMetadata(src
    ? { title: s.title, artist: 'Kitchen Tales', artwork: [{ src, sizes: '512x512', type: 'image/jpeg' }] }
    : { title: s.title, artist: 'Kitchen Tales' })
}

export interface NowPlaying {
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
  /** The story heard before this one (or the folder's previous) and what plays next: the first
   * story in "Urmează", else the folder's next (random when shuffling). */
  prev?: Story
  next?: Story
  /** Where `next` comes from, to pass on to `load`. */
  nextOrigin: Origin
  /** "Urmează": the stories the family chose, that can play here (kid mode: the child's folders). */
  queued: { story: Story; byKid: boolean }[]
  /** The raw list, with ids of stories not loaded yet. */
  upNext: QueuedStory[]
  /** What the folder plays by itself after "Urmează" (up to 5). */
  folderUpcoming: Story[]
  /** Stories finished in a row in this run (for the moon in "Urmează"). */
  playedInRun: number
  playNext: (story: Story) => QueueResult
  addToQueue: (story: Story, byKid?: boolean) => QueueResult
  removeFromQueue: (id: string) => void
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  /** Start this story in the app-wide player. Loading the story already playing does nothing. */
  load: (story: Story, opts?: { autoplay?: boolean; continued?: boolean; from?: QueueFrom; origin?: Origin }) => void
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
/** How a story was started: from "Urmează", by the folder going on, or with ⏮ (else picked by hand). */
export type Origin = 'queue' | 'folder' | 'back'

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
  // "Urmează" (saved on this device), the stories heard before (for ⏮) and the story the folder goes
  // on from (the last one not started from "Urmează").
  const [upNext, setUpNextRaw] = useState<QueuedStory[]>(loadQueue)
  const setUpNext = useCallback((f: (q: QueuedStory[]) => QueuedStory[]) => setUpNextRaw((q) => { const n = f(q); if (n !== q) saveQueue(n); return n }), [])
  const upNextRef = useRef(upNext)
  upNextRef.current = upNext
  const [history, setHistory] = useState<string[]>([])
  const [anchor, setAnchor] = useState<Story>()
  const [playedInRun, setPlayedInRun] = useState(0)
  const [all, setAll] = useState<Story[]>([])
  useEffect(() => watchStories(setAll), [])
  const kidState = useKid()
  const base = anchor ?? story
  const folderName = base ? folderOf(base) : undefined
  const isFav = !!story?.favorite
  // Every folder on the shelf (the rocket sticker: a story heard from each).
  const shelfFolders = useRef<string[]>([])
  // From this device's copy at once (the next story is known even on a weak signal), then the server's.
  useEffect(() => {
    if (!folderName) return
    return watchStories((all) => {
      shelfFolders.current = [...new Set(all.map(folderOf))]
      // Started from Favorite: shuffle and "stop after N" stay within the favourites (sorted like that page).
      setFolder(from === 'favorites'
        ? all.filter((x) => x.favorite).sort((a, b) => a.title.localeCompare(b.title, 'ro'))
        : all.filter((x) => folderOf(x) === folderName))
    })
  }, [folderName, from, isFav])
  const queue = online ? folder : folder.filter((x) => offlineIds.has(x.id))
  const idx = story ? queue.findIndex((x) => x.id === story.id) : -1
  const canPlay = (x: Story) => (online || offlineIds.has(x.id)) && (!kidState.active || kidAllowsFolder(folderOf(x)))
  const byId = new Map(all.map((x) => [x.id, x]))
  const queued = upNext.flatMap((q) => { const x = byId.get(q.id); return x && x.id !== story?.id && canPlay(x) ? [{ story: x, byKid: !!q.byKid }] : [] })
  const inUpNext = new Set(upNext.map((q) => q.id))
  // The folder goes on after the story it was at, skipping what was heard or waits in "Urmează".
  const baseIdx = base ? queue.findIndex((x) => x.id === base.id) : -1
  const folderRest = baseIdx >= 0 ? queue.slice(baseIdx + 1).filter((x) => x.id !== story?.id && !inUpNext.has(x.id) && !heard.current.has(x.id)) : []
  const heardBefore = [...history].reverse().map((h) => byId.get(h) ?? queue.find((x) => x.id === h)).find((x) => x && x.id !== story?.id)
  const prev = heardBefore ?? (idx > 0 ? queue[idx - 1] : undefined)
  // Shuffle picks one random unheard story; the pick stays fixed until the story changes.
  const [shufflePick, setShufflePick] = useState<{ for?: string; pick?: Story }>({})
  useEffect(() => {
    if (!shuffle || !story) return
    const pool = queue.filter((x) => x.id !== story.id && !heard.current.has(x.id) && !upNextRef.current.some((q) => q.id === x.id))
    const from = pool.length ? pool : queue.filter((x) => x.id !== story.id)
    setShufflePick({ for: story.id, pick: from[Math.floor(Math.random() * from.length)] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, story?.id, queue.length])
  const folderNext = shuffle ? (shufflePick.for === story?.id ? shufflePick.pick : undefined) : folderRest[0]
  const next = queued[0]?.story ?? folderNext
  const nextOrigin: Origin = queued[0] ? 'queue' : 'folder'
  const folderUpcoming = shuffle ? (folderNext ? [folderNext] : []) : folderRest.slice(0, 5)
  const nextRef = useRef<Story>(undefined)
  nextRef.current = next
  const nextOriginRef = useRef<Origin>('folder')
  nextOriginRef.current = nextOrigin
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

  const load = useCallback((s: Story, opts?: { autoplay?: boolean; continued?: boolean; from?: QueueFrom; origin?: Origin }) => {
    const cur = storyRef.current
    const origin = opts?.origin
    prepareArt(s)
    if (!opts?.continued && !origin) setFrom(opts?.from ?? 'folder')
    if (cur?.id === s.id) {
      setStory(s)
      // Already loaded but paused (e.g. "Continuă" on the story in the mini player): play it now.
      const a = audio.current
      if (opts?.autoplay && a && a.paused && a.src && !isKidLocked()) a.play().catch(() => {})
      return
    }
    // ⏮ goes back through the stories heard before; anything else remembers the one it leaves.
    if (origin === 'back') setHistory((h) => { const i = h.lastIndexOf(s.id); return i < 0 ? h : h.slice(0, i) })
    else if (cur) setHistory((h) => [...h, cur.id].slice(-50))
    // A story from "Urmează" leaves the list and the folder stays where it was; any other moves it.
    setUpNext((q) => (q.some((x) => x.id === s.id) ? removeFrom(q, s.id) : q))
    if (origin !== 'queue') setAnchor(s)
    // A story you pick yourself starts a new run; one that follows on its own continues it.
    if (!opts?.continued) { played.current = 0; heard.current = new Set(); setPlayedInRun(0) }
    heard.current.add(s.id)
    markPlayed(s.id)
    // A story that finished keeps no place (onEnded cleared it), so it isn't shown as half-heard.
    if (cur && audio.current && !audio.current.ended) setPosition(cur.id, audio.current.currentTime)
    // A story that follows on its own (queue, next/previous buttons) starts from the beginning,
    // even if it was left halfway before: in a run of stories, jumping into the middle is confusing,
    // and with the phone locked there is then no seek before it starts.
    if (opts?.continued || origin === 'queue') setPosition(s.id, undefined)
    autoplay.current = !!opts?.autoplay
    starting.current = false
    setT(0); setDur(0); setEnded(false); setPlaying(false)
    setStory(s)
  }, [setUpNext])

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
    setStory(undefined); setEnded(false); played.current = 0; setPlayedInRun(0); setAnchor(undefined)
  }, [])

  const playNext = (s: Story): QueueResult => {
    if (s.id === storyRef.current?.id) return 'playingNow'
    setUpNext((q) => queueFirst(q, s.id))
    return 'first'
  }
  const addToQueue = (s: Story, byKid = false): QueueResult => {
    if (s.id === storyRef.current?.id) return 'playingNow'
    const q = upNextRef.current
    if (q.some((x) => x.id === s.id)) return 'alreadyThere'
    const n = addLast(q, s.id, byKid)
    if (n === q) return 'kidFull'
    upNextRef.current = n
    setUpNext(() => n)
    return 'added'
  }
  const removeFromQueue = (id: string) => setUpNext((q) => removeFrom(q, id))
  const moveInQueue = (a: number, b: number) => setUpNext((q) => moveTo(q, a, b))
  const clearQueue = () => setUpNext(() => [])

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
    set('nexttrack', () => { const n = nextRef.current; if (n && !isKidLocked()) load(n, { autoplay: true, continued: true, origin: nextOriginRef.current }) })
    set('previoustrack', () => {
      const a = audio.current
      // Like music apps: a few seconds in, "previous" starts the story again.
      if (a && a.currentTime > 5) { a.currentTime = 0; return }
      const p = prevRef.current
      if (p && !isKidLocked()) load(p, { autoplay: true, continued: true, origin: 'back' })
    })
    return () => actions.forEach((x) => set(x, null))
  }, [hasStory, seek, play, load])

  // Lock-screen / headphone controls, with the story's cover as the Now Playing artwork.
  // Car stereos (Bluetooth) often read the cover only once, with the first title they get, so the
  // metadata is set once with its artwork: we wait for the picture (at most ~1.5 s) instead of
  // sending a title without a picture first and the picture later.
  const artKey = story ? artKeyOf(story) : ''
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
    const show = (src?: string) => { if (live) ms.metadata = storyMetadata(s, src) }
    if (artMade.has(artKey)) { show(artMade.get(artKey)); return }
    // Cover still loading (or failing): after a moment, show the drawn tile rather than nothing.
    const fallback = setTimeout(() => { storyArtwork(s).then((src) => { if (!artMade.has(artKey)) show(src) }, () => show()) }, 1500)
    prepareArt(s).then((src) => { clearTimeout(fallback); show(src) })
    return () => { live = false; clearTimeout(fallback) }
  }, [artKey])

  // When a story ends: play the next one until the chosen number of stories is reached.
  const onEnded = () => {
    setPlaying(false)
    if (storyRef.current) setPosition(storyRef.current.id, undefined)
    played.current += 1
    setPlayedInRun(played.current)
    const done = storyRef.current
    if (done) track({ t: 'story-finished', storyId: done.id, folder: folderOf(done), folders: shelfFolders.current, secs: done.durationSec, source: done.source, offline: fromDevice.current, kid: isKidMode() })
    const following = nextRef.current
    if (following && played.current < sleepRef.current && !isKidLocked()) load(following, { autoplay: true, continued: true, origin: nextOriginRef.current })
    else {
      // Several stories in a row, then the player stopped by itself: the little cloud.
      if (sleepRef.current > 1 && played.current >= sleepRef.current) track({ t: 'sleep-stop' })
      played.current = 0; setPlayedInRun(0); setEnded(true)
    }
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

  const value: NowPlaying = { story, url, playing, t, dur, ended, error, sleep, shuffle, prev, next, nextOrigin, queued, upNext, folderUpcoming, playedInRun,
    playNext, addToQueue, removeFromQueue, moveInQueue, clearQueue, load, update, toggle, skip, seek, restart, chooseSleep, toggleShuffle, rate, cycleRate, close, fadeOut }
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
          // Ready the next story's picture, so it goes out with its title when that story starts.
          if (nextRef.current) prepareArt(nextRef.current)
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
            // The car reads the picture when the track starts: send it before play() if it is ready.
            if (cur && 'mediaSession' in navigator && artMade.get(artKeyOf(cur))) navigator.mediaSession.metadata = storyMetadata(cur, artMade.get(artKeyOf(cur)))
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
