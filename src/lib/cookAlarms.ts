// Cooking timers keep going when you leave cooking mode (to read the recipe, check the shopping
// list): one that ends while you are elsewhere in the app rings here, with a message that takes you
// back to that step. In cooking mode itself, the screen rings on its own (pages/CookMode.tsx).
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadTimers, saveTimers, TIMERS_PREFIX } from './cooking'
import { ringAlarm } from './alarm'
import { showToast } from './toast'

/** Recipe ids that have timers saved on this device. */
function recipesWithTimers() {
  try { return Object.keys(localStorage).filter((k) => k.startsWith(TIMERS_PREFIX)).map((k) => k.slice(TIMERS_PREFIX.length)) } catch { return [] }
}

export function useCookAlarms() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const id of recipesWithTimers()) {
        // That recipe's cooking screen is open: it rings itself.
        if (pathname === `/retete/${id}/gateste`) continue
        const timers = loadTimers(id)
        const done = Object.entries(timers).filter(([, t]) => t.endsAt && t.endsAt <= now)
        if (!done.length) continue
        // Rung once: from now on the step shows "Gata!" until the timer is started again.
        for (const [k, t] of done) timers[+k] = { total: t.total, left: 0, title: t.title }
        saveTimers(id, timers)
        const step = +done[0][0]
        ringAlarm()
        showToast(`Cronometrul e gata: ${done[0][1].title ?? 'rețeta'}, pasul ${step + 1}`,
          () => navigate(`/retete/${id}/gateste`), { label: 'Deschide', ms: 15_000 })
      }
    }
    check()
    const h = setInterval(check, 1000)
    // Timers sleep while the app is in the background: check as soon as it is back.
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(h); document.removeEventListener('visibilitychange', onVisible) }
  }, [pathname, navigate])
}
