export function formatMinutes(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), rest = m % 60
  return rest ? `${h} h ${rest}` : `${h} h`
}

/** Lowercase without diacritics, for searching ("Ciorbă" matches "ciorba"). */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
