import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Story } from './types'
import { fileUrl, getOfflineAudio, listStories } from './db'
import { folderOf, getPosition, setPosition } from './stories'
import { useOfflineIds, useOnline } from './useOffline'
import { useCoverUrl } from './useCoverUrl'
import { storyArtwork } from './artwork'

/** How many stories to play in a row before stopping. */
export type Sleep = 1 | 2 | 3 | 5
const SLEEP_KEY = 'kt-stop-after'
const SHUFFLE_KEY = 'kt-shuffle'
const readNum = (k: string, d: number) => { try { return +(localStorage.getItem(k) ?? d) || d } catch { return d } }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

interface NowPlaying {
  story?: Story
  url?: string
  playing: boolean
  t: number
  dur: number
  ended: boolean
  sleep: Sleep
  shuffle: boolean
  /** The previous / next story in the current folder (next is random when shuffling). */
  prev?: Story
  next?: Story
  /** Start (or keep) this story in the app-wide player. Loading the story already playing does nothing. */
  load: (story: Story, opts?: { autoplay?: boolean; continued?: boolean }) => void
  /** Update the current story's details (e.g. a new cover) without touching playback. */
  update: (story: Story) => void
  toggle: () => void
  skip: (sec: number) => void
  seek: (sec: number) => void
  restart: () => void
  chooseSleep: (v: Sleep) => void
  toggleShuffle: () => void
  /** Stop and forget the current story (closes the mini player). */
  close: () => void
}

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
  const [sleep, setSleep] = useState<Sleep>(() => ([1, 2, 3, 5].includes(readNum(SLEEP_KEY, 1)) ? readNum(SLEEP_KEY, 1) : 1) as Sleep)
  const [shuffle, setShuffle] = useState(() => readNum(SHUFFLE_KEY, 0) === 1)
  const played = useRef(0) // stories finished in this run, for "stop after N stories"
  const heard = useRef(new Set<string>()) // stories already played in this run, so shuffle doesn't repeat
  const autoplay = useRef(false)
  const storyRef = useRef<Story>(undefined)
  storyRef.current = story

  // The current folder, in shelf order (offline: only stories saved on this device).
  const online = useOnline()
  const offlineIds = useOfflineIds()
  const [folder, setFolder] = useState<Story[]>([])
  const folderName = story ? folderOf(story) : undefined
  useEffect(() => {
    if (!folderName) return
    let live = true
    listStories().then((all) => { if (live) setFolder(all.filter((x) => folderOf(x) === folderName)) }).catch(() => {})
    return () => { live = false }
  }, [folderName])
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
  const sleepRef = useRef(sleep)
  sleepRef.current = sleep

  // Resolve the audio: the copy saved on this device, otherwise a signed S3 link.
  useEffect(() => {
    if (!story) { setUrl(undefined); return }
    let live = true
    let blobUrl: string | undefined
    setUrl(undefined)
    ;(async () => {
      const blob = await getOfflineAudio(story.id).catch(() => undefined)
      if (!live) return
      if (blob) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl) }
      else if (story.audioKey) { const u = await fileUrl(story.audioKey); if (live) setUrl(u) }
    })().catch(() => {})
    return () => { live = false; if (blobUrl) URL.revokeObjectURL(blobUrl) }
    // Only a different story needs new audio; cover or title edits keep playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  const load = useCallback((s: Story, opts?: { autoplay?: boolean; continued?: boolean }) => {
    const cur = storyRef.current
    if (cur?.id === s.id) { setStory(s); return }
    // A story you pick yourself starts a new run; one that follows on its own continues it.
    if (!opts?.continued) { played.current = 0; heard.current = new Set() }
    heard.current.add(s.id)
    if (cur && audio.current) setPosition(cur.id, audio.current.currentTime)
    autoplay.current = !!opts?.autoplay
    setT(0); setDur(0); setEnded(false); setPlaying(false)
    setStory(s)
  }, [])

  const update = useCallback((s: Story) => { if (storyRef.current?.id === s.id) setStory(s) }, [])
  const toggle = useCallback(() => { const a = audio.current; if (!a) return; setEnded(false); if (a.paused) a.play().catch(() => {}); else a.pause() }, [])
  const skip = useCallback((d: number) => { const a = audio.current; if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }, [])
  const seek = useCallback((sec: number) => { if (audio.current) audio.current.currentTime = sec }, [])
  const restart = useCallback(() => { const a = audio.current; if (!a) return; setEnded(false); a.currentTime = 0; a.play().catch(() => {}) }, [])
  const chooseSleep = (v: Sleep) => { played.current = 0; setSleep(v); store(SLEEP_KEY, String(v)) }
  const toggleShuffle = () => setShuffle((x) => { store(SHUFFLE_KEY, x ? '0' : '1'); return !x })
  const close = useCallback(() => {
    const a = audio.current
    const cur = storyRef.current
    if (a && cur) { a.pause(); setPosition(cur.id, a.currentTime) }
    setStory(undefined); setEnded(false); played.current = 0
  }, [])

  // Lock-screen / headphone controls, with the story's cover as the Now Playing artwork.
  const coverUrl = useCoverUrl(story?.coverKey)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!story) { navigator.mediaSession.metadata = null; return }
    let live = true
    navigator.mediaSession.metadata = new MediaMetadata({ title: story.title, artist: 'Bucătăria cu povești' })
    storyArtwork(story, coverUrl).then((src) => {
      if (!live || !src) return
      navigator.mediaSession.metadata = new MediaMetadata({
        title: story.title, artist: 'Bucătăria cu povești', artwork: [{ src, sizes: '512x512', type: 'image/png' }],
      })
    }).catch(() => {})
    return () => { live = false }
  }, [story, coverUrl])

  // When a story ends: play the next one until the chosen number of stories is reached.
  const onEnded = () => {
    setPlaying(false)
    if (storyRef.current) setPosition(storyRef.current.id, undefined)
    played.current += 1
    const following = nextRef.current
    if (following && played.current < sleepRef.current) load(following, { autoplay: true, continued: true })
    else { played.current = 0; setEnded(true) }
  }

  const value: NowPlaying = { story, url, playing, t, dur, ended, sleep, shuffle, prev, next, load, update, toggle, skip, seek, restart, chooseSleep, toggleShuffle, close }
  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audio} src={url}
        onPlay={() => { setPlaying(true); setEnded(false) }}
        onPause={() => { setPlaying(false); if (storyRef.current) setPosition(storyRef.current.id, audio.current?.currentTime) }}
        onEnded={onEnded}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          setDur(isFinite(a.duration) ? a.duration : 0)
          const cur = storyRef.current
          const pos = cur ? getPosition(cur.id) : 0
          if (pos && (!isFinite(a.duration) || pos < a.duration - 5)) a.currentTime = pos
          if (autoplay.current) { autoplay.current = false; a.play().catch(() => {}) }
        }} />
    </Ctx.Provider>
  )
}
