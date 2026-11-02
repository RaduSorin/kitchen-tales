// Kitchen timer alarm. iOS only lets a page make sound from an AudioContext that was started
// during a tap, so the cook screen calls unlockAlarm() on the first touch and the timer reuses it.
let ctx: AudioContext | undefined

type AudioSessionNav = Navigator & { audioSession?: { type: string } }

export function unlockAlarm() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    // A silent blip inside the tap fully unlocks output on iOS.
    const o = ctx.createOscillator(), g = ctx.createGain()
    g.gain.value = 0; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.01)
  } catch { /* audio not available */ }
}

/** A clear, repeating chime (about 4 seconds) plus vibration where supported. */
export function ringAlarm() {
  navigator.vibrate?.([300, 150, 300, 150, 300])
  try {
    ctx ??= new AudioContext()
    const nav = navigator as AudioSessionNav
    // Play even with the iPhone's silent switch on (Safari 16.4+); back to normal afterwards.
    const session = nav.audioSession
    const prevType = session?.type
    if (session) session.type = 'playback'
    const c = ctx
    c.resume().catch(() => {}).finally(() => {
      const start = c.currentTime + 0.05
      const notes = [988, 1319] // B5, E6: a bright two-tone chime
      for (let round = 0; round < 4; round++) {
        notes.forEach((f, n) => {
          const t = start + round * 1 + n * 0.18
          const o = c.createOscillator(), g = c.createGain()
          o.type = 'sine'; o.frequency.value = f
          o.connect(g); g.connect(c.destination)
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
          o.start(t); o.stop(t + 0.65)
        })
      }
      if (session) setTimeout(() => { session.type = prevType ?? 'auto' }, 4500)
    })
  } catch { /* audio not available */ }
}
