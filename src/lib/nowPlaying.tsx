import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Story } from './types'
import { fileUrl, getOfflineAudio } from './db'
import { getPosition, setPosition } from './stories'
import { useCoverUrl } from './useCoverUrl'
import { storyArtwork } from './artwork'

export type Sleep = 'end' | 15 | 30

interface NowPlaying {
  story?: Story
  url?: string
  playing: boolean
  t: number
  dur: number
  ended: boolean
  sleep: Sleep
  /** Start (or keep) this story in the app-wide player. Loading the story already playing does nothing. */
  load: (story: Story, opts?: { autoplay?: boolean }) => void
  /** Update the current story's details (e.g. a new cover) without touching playback. */
  update: (story: Story) => void
  toggle: () => void
  skip: (sec: number) => void
  seek: (sec: number) => void
  restart: () => void
  chooseSleep: (v: Sleep) => void
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
  const [sleep, setSleep] = useState<Sleep>('end')
  const sleepLeft = useRef(0) // ms of listening left before the sleep timer stops the story
  const sleepReset = useRef(false)
  const autoplay = useRef(false)
  const storyRef = useRef<Story>(undefined)
  storyRef.current = story

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

  const load = useCallback((s: Story, opts?: { autoplay?: boolean }) => {
    const cur = storyRef.current
    if (cur?.id === s.id) { setStory(s); return }
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
  const chooseSleep = (v: Sleep) => { sleepLeft.current = v === 'end' ? 0 : v * 60000; sleepReset.current = playing && sleep !== 'end'; setSleep(v) }
  const close = useCallback(() => {
    const a = audio.current
    const cur = storyRef.current
    if (a && cur) { a.pause(); setPosition(cur.id, a.currentTime) }
    setStory(undefined); setEnded(false); setSleep('end'); sleepLeft.current = 0
  }, [])

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

  // Lock-screen / headphone controls, with the story's cover as the Now Playing artwork.
  const coverUrl = useCoverUrl(story?.coverKey)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!story) { navigator.mediaSession.metadata = null; return }
    let live = true
    navigator.mediaSession.metadata = new MediaMetadata({ title: story.title, artist: 'Kitchen Tales' })
    storyArtwork(story, coverUrl).then((src) => {
      if (!live || !src) return
      navigator.mediaSession.metadata = new MediaMetadata({
        title: story.title, artist: 'Kitchen Tales', artwork: [{ src, sizes: '512x512', type: 'image/png' }],
      })
    }).catch(() => {})
    return () => { live = false }
  }, [story, coverUrl])

  const value: NowPlaying = { story, url, playing, t, dur, ended, sleep, load, update, toggle, skip, seek, restart, chooseSleep, close }
  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audio} src={url}
        onPlay={() => { setPlaying(true); setEnded(false) }}
        onPause={() => { setPlaying(false); if (storyRef.current) setPosition(storyRef.current.id, audio.current?.currentTime) }}
        onEnded={() => { setPlaying(false); if (storyRef.current) setPosition(storyRef.current.id, undefined); setEnded(true) }}
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
