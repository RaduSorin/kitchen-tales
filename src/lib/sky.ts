import { useEffect, useState } from 'react'
import { cityByName, skyPhase, type SkyPhase } from './sun'


/**
 * Day, dusk or night right now, checked every minute and when the app comes back. Sunset in
 * Bucharest is close enough for the whole country (a few minutes apart), so there is no setting.
 */
export function useSkyPhase(): SkyPhase {
  const { lat, lon } = cityByName('București')
  const [phase, setPhase] = useState(() => skyPhase(new Date(), lat, lon))
  useEffect(() => {
    const update = () => setPhase(skyPhase(new Date(), lat, lon))
    update()
    const id = setInterval(update, 60000)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', update) }
  }, [lat, lon])
  return phase
}

