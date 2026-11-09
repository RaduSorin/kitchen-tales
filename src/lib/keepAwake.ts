/**
 * Keeps the screen on until the returned function is called (used while recording, so the
 * phone doesn't lock and cut the microphone).
 *
 * Uses the Screen Wake Lock API and takes the lock again whenever the app comes back to the
 * front (the browser drops it when the page is hidden). Where the API is missing, refuses or
 * lets go (older iOS, home-screen apps before iOS 18.4), a tiny silent video plays instead,
 * which iOS also treats as "something is playing, don't lock".
 */
// The silent clip (1.7 KB) is inside the app's code rather than a file on the server: the hosting's
// single-page-app rule answers unknown file types like .mp4 with index.html, and offline there is no
// server at all. It plays from a blob link made once.
import clipData from '../assets/keep-awake.mp4?inline'

let clipUrl: string | undefined
function clip() {
  if (clipUrl) return clipUrl
  try {
    const [head, b64] = clipData.split(',')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    clipUrl = URL.createObjectURL(new Blob([bytes], { type: /^data:([^;]+)/.exec(head)?.[1] || 'video/mp4' }))
  } catch {
    clipUrl = clipData
  }
  return clipUrl
}

const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
// Before iOS 18.4 the wake lock is granted in apps added to the home screen but does not hold.
const OLD_IOS_APP = IOS && (() => {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent)
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia?.('(display-mode: standalone)').matches
  return !!standalone && !!m && (+m[1] < 18 || (+m[1] === 18 && +m[2] < 4))
})()

/**
 * Call it from the tap that starts the work (Safari grants the wake lock only right after a tap,
 * and starts a video with sound only from one). It takes the lock again after each later tap or
 * return to the app if the phone dropped it.
 */
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | undefined
  let video: HTMLVideoElement | undefined
  let done = false

  // Safari keeps the screen on for a playing video only if it can make sound (a silent audio
  // track, not muted) and is not set to loop, so the clip is sent back to the start by hand.
  const makeVideo = () => {
    const v = document.createElement('video')
    v.src = clip()
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.disableRemotePlayback = true
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0'
    v.addEventListener('timeupdate', () => { if (v.currentTime > 5) v.currentTime = 0.1 })
    document.body.appendChild(v)
    return v
  }
  const playVideo = () => { if (!done && video) video.play().catch(() => {}) }
  const held = () => !!lock && !lock.released

  const take = () => {
    if (done || document.visibilityState !== 'visible') return
    // The video is started inside the tap, so it may play later too (if the lock is refused or lost);
    // it is paused again as soon as the lock holds.
    if (!video) { video = makeVideo(); playVideo() }
    if (!navigator.wakeLock || OLD_IOS_APP) { playVideo(); return }
    if (held()) { video.pause(); return }
    navigator.wakeLock.request('screen')
      .then((l) => {
        if (done) { l.release().catch(() => {}); return }
        lock = l
        video?.pause()
        // The phone can drop the lock on its own: fall back to the video until it is taken again.
        l.addEventListener('release', () => { if (!done && lock === l) { lock = undefined; playVideo(); take() } })
      })
      .catch(playVideo)
  }
  const onVisible = () => { if (document.visibilityState === 'visible') take() }
  // Every tap counts as permission again, so a dropped lock is taken back at the next touch.
  const onTap = () => { if (!held()) take() }

  take()
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('pointerdown', onTap, true)
  return () => {
    done = true
    document.removeEventListener('visibilitychange', onVisible)
    document.removeEventListener('pointerdown', onTap, true)
    lock?.release().catch(() => {})
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove() }
  }
}
