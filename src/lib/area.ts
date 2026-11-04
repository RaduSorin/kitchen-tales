import { useLocation } from 'react-router-dom'

/** Which half of the app you're in: recipes (day) or stories (night). */
export type Area = 'day' | 'night'

let lastArea: Area = 'day'

/** The Profile belongs to the side you opened it from, so the colors, switch and tab bar don't jump. */
export function areaOf(pathname: string): Area {
  let area: Area
  if (pathname.startsWith('/povesti')) area = 'night'
  else if (pathname.startsWith('/profil')) area = lastArea
  else area = 'day'
  lastArea = area
  return area
}

export function useArea() {
  return areaOf(useLocation().pathname)
}

/** The story player fills the screen like the cooking mode: no top bar or tab bar, so a child can't wander off. */
export const isPlayerPage = (path: string) => /^\/povesti\/[^/]+$/.test(path) && path !== '/povesti/adauga' && path !== '/povesti/acasa'
