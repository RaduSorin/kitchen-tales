// Turns dictated ingredient phrases into list lines the app can scale,
// e.g. "Cinci sute de grame de făină." -> "500 g făină".

const SMALL: Record<string, string> = {
  un: '1', o: '1', una: '1', unu: '1', doi: '2', două: '2', doua: '2', trei: '3', patru: '4', cinci: '5',
  șase: '6', sase: '6', șapte: '7', sapte: '7', opt: '8', nouă: '9', noua: '9', zece: '10',
  jumătate: '½', jumatate: '½', sfert: '¼',
}

// Spoken unit (after a number) -> short form. "de" after the unit is dropped: "500 g făină".
// (?=\s|$) instead of \b: \b does not treat Romanian letters like ă as part of a word.
const END = String.raw`\.?(?=\s|$)(?:\s+de(?=\s|$))?`
const unit = (words: string) => new RegExp(String.raw`^(?:de\s+)?(${words})${END}`, 'i')
const UNITS: [RegExp, string | null][] = [
  [unit('grame|gram|gr|g'), 'g'],
  [unit('kilograme|kilogram|kilo|kile|kg'), 'kg'],
  [unit('mililitri|mililitru|ml'), 'ml'],
  [unit('litri|litru|l'), 'l'],
  // Kitchen measures stay as said, only "de" goes: "2 linguri de zahăr" -> "2 linguri zahăr".
  [unit('linguri|lingură|lingura|lingurițe|linguriță|lingurite|lingurita|căni|cană|cana|pahare|pahar|plicuri|plic|bucăți|bucată|bucati|bucata|fire|fir|căței|cățel|catei|catel|legături|legătură|praf|vârf de cuțit|varf de cutit'), null],
]

/** Splits one dictated phrase into ingredients: on commas, semicolons, " și apoi ", or where a new amount starts. */
export function splitSpoken(phrase: string): string[] {
  return phrase
    .split(/[;]|,(?!\d)|\.(?!\d)|\s+(?:și\s+)?apoi\s+|(?<=\p{L})\s+(?=\d)/u)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Cleans one spoken ingredient: number words to digits, units shortened, no trailing dot, lower case. */
export function cleanSpokenIngredient(raw: string): string {
  let s = raw.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  if (!s) return ''
  // Leading number word: "o lingură", "două ouă", "un sfert de...", "jumătate de...".
  const [first, ...more] = s.split(' ')
  const n = SMALL[first.toLowerCase()]
  if (n && more.length) {
    const rest = more.join(' ')
    const hundreds = /^(sute|sută|suta)(?=\s|$)\s*/i.exec(rest)
    if (hundreds && /^\d+$/.test(n)) s = `${+n * 100} ${rest.slice(hundreds[0].length)}`
    else if (/^sfert(?=\s|$)/i.test(rest)) s = `¼ ${rest.replace(/^sfert\s*/i, '').replace(/^de\s+/i, '')}`
    else if (n === '½') s = `½ ${rest.replace(/^de\s+/i, '')}`
    else s = `${n} ${rest}`
  }
  // "500 de grame de făină" -> "500 g făină"
  const m = /^(\d+(?:[.,]\d+)?(?:\s*[¼½¾])?|[¼½¾])\s*(.*)$/.exec(s)
  if (m) {
    let rest = m[2]
    for (const [re, short] of UNITS) {
      const u = re.exec(rest)
      if (u) { rest = `${short ?? u[1]} ${rest.slice(u[0].length).trim()}`.trim(); break }
    }
    rest = rest.replace(/^de\s+/i, '')
    s = `${m[1].trim()} ${rest}`.trim()
  }
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** All ingredient lines from the dictated phrases. */
export function spokenIngredientLines(segments: string[]): string[] {
  return segments.flatMap(splitSpoken).map(cleanSpokenIngredient).filter(Boolean)
}
