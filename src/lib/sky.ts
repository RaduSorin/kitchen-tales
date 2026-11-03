import { useEffect, useState } from 'react'
import { useSettings } from './settings'
import { cityByName, skyPhase, type SkyPhase } from './sun'


/** The stories sky right now (day, dusk or night), checked every minute and when the app comes back. */
export function useSkyPhase(): SkyPhase {
  const { city } = useSettings()
  const { lat, lon } = cityByName(city)
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

