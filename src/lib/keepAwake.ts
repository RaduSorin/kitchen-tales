/**
 * Keeps the screen on until the returned function is called (used while recording, so the
 * phone doesn't lock and cut the microphone).
 *
 * Uses the Screen Wake Lock API and takes the lock again whenever the app comes back to the
 * front (the browser drops it when the page is hidden). Where the API is missing or refuses
 * (older iOS, some home-screen apps), a tiny silent video loops in the background instead,
 * which iOS also treats as "something is playing, don't lock".
 */
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | undefined
  let video: HTMLVideoElement | undefined
  let done = false

  const startVideo = () => {
    if (done || video) return
    const v = document.createElement('video')
    v.src = '/keep-awake.mp4'
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
