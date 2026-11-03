// Sunrise and sunset worked out on the device (the usual "sunrise equation"), so the stories sky
// can follow the real daylight without internet. Accurate to a minute or two, which is plenty here.

/** Places to choose from in Settings; the sky only needs to be roughly right. */
export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'București', lat: 44.43, lon: 26.1 },
  { name: 'Arad', lat: 46.18, lon: 21.31 },
  { name: 'Bacău', lat: 46.57, lon: 26.91 },
  { name: 'Baia Mare', lat: 47.66, lon: 23.58 },
  { name: 'Brașov', lat: 45.65, lon: 25.61 },
  { name: 'Chișinău', lat: 47.01, lon: 28.86 },
  { name: 'Cluj-Napoca', lat: 46.77, lon: 23.59 },
  { name: 'Constanța', lat: 44.18, lon: 28.63 },
  { name: 'Craiova', lat: 44.32, lon: 23.8 },
  { name: 'Galați', lat: 45.44, lon: 28.05 },
  { name: 'Iași', lat: 47.16, lon: 27.59 },
  { name: 'Oradea', lat: 47.05, lon: 21.92 },
  { name: 'Pitești', lat: 44.86, lon: 24.87 },
  { name: 'Ploiești', lat: 44.94, lon: 26.03 },
  { name: 'Sibiu', lat: 45.79, lon: 24.15 },
  { name: 'Suceava', lat: 47.65, lon: 26.26 },
  { name: 'Târgu Mureș', lat: 46.54, lon: 24.56 },
  { name: 'Timișoara', lat: 45.75, lon: 21.23 },
]

export const cityByName = (name: string) => CITIES.find((c) => c.name === name) ?? CITIES[0]

const RAD = Math.PI / 180
const sin = (d: number) => Math.sin(d * RAD)
const cos = (d: number) => Math.cos(d * RAD)
const toDate = (julian: number) => new Date((julian - 2440587.5) * 86400000)

/** Today's sunrise and sunset (as moments in time) for the given place. */
export function sunTimes(day: Date, lat: number, lon: number) {
  const noon = new Date(day)
  noon.setHours(12, 0, 0, 0)
  const n = Math.round(noon.getTime() / 86400000 + 2440587.5 - 2451545 + 0.0008)
  const j = n - lon / 360 // mean solar noon
  const m = (357.5291 + 0.98560028 * j) % 360 // mean anomaly
  const c = 1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m)
  const l = (m + c + 180 + 102.9372) % 360 // ecliptic longitude
  const transit = 2451545 + j + 0.0053 * sin(m) - 0.0069 * sin(2 * l)
  const decl = Math.asin(sin(l) * sin(23.4397)) / RAD
  const cosH = (sin(-0.833) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl))
  const h = Math.acos(Math.min(1, Math.max(-1, cosH))) / RAD // half the day, in degrees
  return { rise: toDate(transit - h / 360), set: toDate(transit + h / 360) }
}

export type SkyPhase = 'day' | 'dusk' | 'night'

const HOUR = 3600000

/** Day from sunrise to an hour before sunset, dusk for the two hours around sunset, night until sunrise. */
export function skyPhase(now: Date, lat: number, lon: number): SkyPhase {
  const { rise, set } = sunTimes(now, lat, lon)
  const t = now.getTime()
  if (t >= set.getTime() - HOUR && t < set.getTime() + HOUR) return 'dusk'
  if (t >= rise.getTime() && t < set.getTime() - HOUR) return 'day'
  return 'night'
}

/** Status bar color for each sky, matching the top of its gradient. */
export const SKY_TOP: Record<SkyPhase, string> = { day: '#78bff9', dusk: '#2f2878', night: '#121541' }
