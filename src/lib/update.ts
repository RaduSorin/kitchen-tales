/// <reference types="vite-plugin-pwa/client" />
// A new version of the app: the home-screen app on iPhone can keep running an old build for days,
// so it looks for a new one whenever it comes back to the screen (and every half hour), and then
// offers to reload. It never reloads by itself, so a story or a cooking timer is not cut off.
import { registerSW } from 'virtual:pwa-register'
import { currentToast, showToast, subscribeToast } from './toast'

let waiting = false
let apply: ((reload?: boolean) => Promise<void>) | undefined

function offer() {
  showToast('Versiune nouă a aplicației', undefined, {
    sticky: true,
    action: { label: 'Reîncarcă', run: () => { waiting = false; apply?.(true) } },
  })
}

export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return
  apply = registerSW({
    onNeedRefresh() { waiting = true; offer() },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}) }
      document.addEventListener('visibilitychange', check)
      setInterval(check, 30 * 60_000)
    },
  })
  // Another message took the toast's place: offer again once it is gone.
  subscribeToast(() => { if (waiting && !currentToast()) setTimeout(() => { if (waiting && !currentToast()) offer() }, 1500) })
}
