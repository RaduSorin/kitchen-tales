export function formatMinutes(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), rest = m % 60
  return rest ? `${h} h ${rest}` : `${h} h`
}

/** Lowercase without diacritics, for searching ("Ciorbă" matches "ciorba"). */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * A rough Romanian word stem for search, so singular and plural meet: "ceapă" and "cepe" both
 * become "cep", "roșie" / "roșii", "cartof" / "cartofi", "varză" / "verze", "ou" / "ouă".
 * Endings and articles come off, and the vowel changes of the plural (ea→e, oa→o, a→e) are
 * folded together. It only has to make two forms of a word land on the same key.
 */
const ENDINGS = ['urilor', 'elor', 'ilor', 'ului', 'urile', 'uri', 'ele', 'lor', 'ul', 'le', 'ii', 'i', 'e', 'a', 'u']
export function stem(word: string) {
  let s = norm(word).replace(/[^\p{L}\p{N}]/gu, '')
  for (const e of ENDINGS) if (s.endsWith(e) && s.length - e.length >= 2) { s = s.slice(0, -e.length); break }
  return s.replace(/ea/g, 'e').replace(/oa/g, 'o').replace(/a/g, 'e')
}
const sameWord = (a: string, b: string) => {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 3 && long.startsWith(short)
}

/**
 * Search: true when every word of the query is in the text, either as typed (inside a word too,
 * like before) or as another form of the same word ("ceapa" finds "2 cepe").
 */
export function matchesQuery(text: string, query: string) {
  const words = norm(query.trim()).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const t = norm(text)
  const stems = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem)
  return words.every((w) => t.includes(w) || stems.some((s) => sameWord(s, stem(w))))
}
