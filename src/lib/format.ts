export function formatMinutes(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), rest = m % 60
  return rest ? `${h} h ${rest}` : `${h} h`
}
