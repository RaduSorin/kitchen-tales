/**
 * Keeps the screen on until the returned function is called (used while recording, so the
 * phone doesn't lock and cut the microphone).
 *
 * Uses the Screen Wake Lock API and takes the lock again whenever the app comes back to the
 * front (the browser drops it when the page is hidden). Where the API is missing or refuses
 * (older iOS, some home-screen apps), a tiny silent video loops in the background instead,
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

export function keepAwake(): () => void {
  let lock: WakeLockSentinel | undefined
  let video: HTMLVideoElement | undefined
  let done = false

  const startVideo = () => {
    if (done || video) return
    const v = document.createElement('video')
    v.src = clip()
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'
    document.body.appendChild(v)
    video = v
    v.play().catch(() => {})
  }

  const take = () => {
    if (done) return
    // On iPhone the wake lock can be granted and still not hold (apps added to the home screen,
    // before iOS 18.4), and a locked phone cuts the microphone: run the silent video as well.
    if (IOS) { startVideo(); video?.play().catch(() => {}) }
    if (!navigator.wakeLock) { startVideo(); video?.play().catch(() => {}); return }
    navigator.wakeLock.request('screen')
      .then((l) => { if (done) l.release().catch(() => {}); else lock = l })
      .catch(startVideo)
  }
  const onVisible = () => { if (document.visibilityState === 'visible') take() }

  take()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    done = true
    document.removeEventListener('visibilitychange', onVisible)
    lock?.release().catch(() => {})
    if (video) { video.pause(); video.remove() }
  }
}
