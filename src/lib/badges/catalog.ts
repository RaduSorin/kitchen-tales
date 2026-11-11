// Every badge: stamps for the recipes side (the "Clasor"), stickers for the stories side (the
// "Album"). Each has a goal over the person's counters (see engine.ts). Drawings: art.ts.
import type { BadgeState } from './engine'

export type BadgeKind = 'stamp' | 'sticker'
/** A stamp's ink, by group: adding (brick), cooking (green), plan (mustard), family (blue), surprises (plum). */
export type Ink = 'add' | 'cook' | 'plan' | 'family' | 'secret'

export interface Badge {
  id: string
  kind: BadgeKind
  /** The group it is listed under. */
  group: string
  name: string
  /** What earns it, as a fact ("10 rețete adăugate."): shown when it is missing and when it arrives. */
  how: string
  /** The character drawn on it (art.ts). */
  art: string
  /** Stamps: the line printed under the picture, and the ink. */
  cap?: string
  ink?: Ink
  /** The number printed on a stamp of a series (5, 10, 25…). */
  lvl?: number
  /** Shown as a question mark until earned. */
  secret?: boolean
  /** A listening sticker: at most one an evening. */
  listen?: boolean
  /** [done so far, needed]. */
  goal: (s: BadgeState, now: Date) => [number, number]
}

/** The longest run of consecutive days in a list of YYYY-MM-DD days. */
export function longestRun(days: string[]) {
  const ms = [...new Set(days)].map((d) => { const [y, m, n] = d.split('-').map(Number); return Date.UTC(y, m - 1, n) }).sort((a, b) => a - b)
  let best = 0, run = 0
  ms.forEach((t, i) => { run = i && t - ms[i - 1] === 86_400_000 ? run + 1 : 1; best = Math.max(best, run) })
  return best
}
const c = (s: BadgeState, key: string) => s.counts[key] ?? 0
const count = (key: string, need = 1) => (s: BadgeState): [number, number] => [c(s, key), need]
const size = (key: string, need: number) => (s: BadgeState): [number, number] => [s.sets[key]?.length ?? 0, need]
const most = (prefix: string, need: number) => (s: BadgeState): [number, number] =>
  [Math.max(0, ...Object.entries(s.counts).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)), need]

type Def = Omit<Badge, 'kind' | 'group' | 'ink'>
const stamps = (group: string, ink: Ink, defs: Def[]): Badge[] => defs.map((d) => ({ ...d, kind: 'stamp', group, ink }))
const stickers = (group: string, defs: Def[]): Badge[] => defs.map((d) => ({ ...d, kind: 'sticker', group }))

export const STAMP_GROUPS = ['Adăugare', 'La gătit', 'Plan și caiet', 'Familie', 'Surprize'] as const
export const STICKER_GROUPS = ['La ascultat', 'La făcut povești', 'Obiceiuri bune'] as const

export const BADGES: Badge[] = [
  ...stamps('Adăugare', 'add', [
    { id: 'scrisa', art: 'pencil', cap: 'SCRISĂ', name: 'Din mâna mea', how: 'Prima rețetă scrisă de la zero, în editor.', goal: count('way:written') },
    { id: 'link', art: 'globe', cap: 'DIN LINK', name: 'Găsită pe net', how: 'Prima rețetă adăugată dintr-un link de site.', goal: count('way:link') },
    { id: 'video', art: 'tv', cap: 'DIN VIDEO', name: 'De pe ecran', how: 'Prima rețetă dintr-un video YouTube, TikTok sau Instagram.', goal: count('way:video') },
    { id: 'poza', art: 'camera', cap: 'DIN POZĂ', name: 'Caietul bunicii', how: 'Prima rețetă scoasă dintr-o poză: carte, caiet sau bilețel.', goal: count('way:photo') },
    { id: 'dictat', art: 'mic', cap: 'DICTATĂ', name: 'Spusă cu voce tare', how: 'Prima rețetă dictată.', goal: count('way:dictation') },
    { id: 'frigider', art: 'fridge', cap: 'DIN FRIGIDER', name: 'Din ce aveam', how: 'O rețetă salvată din ideile pentru „Ce pot găti din frigider”.', goal: count('way:fridge') },
    { id: 'c5', art: 'toque', lvl: 5, cap: '5 REȚETE', name: 'Ucenic', how: '5 rețete adăugate.', goal: count('recipes', 5) },
    { id: 'c10', art: 'toque', lvl: 10, cap: '10 REȚETE', name: 'Bucătar', how: '10 rețete adăugate.', goal: count('recipes', 10) },
    { id: 'c25', art: 'toque', lvl: 25, cap: '25 REȚETE', name: 'Sous-chef', how: '25 de rețete adăugate.', goal: count('recipes', 25) },
    { id: 'c50', art: 'toque', lvl: 50, cap: '50 REȚETE', name: 'Chef', how: '50 de rețete adăugate.', goal: count('recipes', 50) },
    { id: 'c100', art: 'toque', lvl: 100, cap: '100 REȚETE', name: 'Cartea casei', how: '100 de rețete adăugate.', goal: count('recipes', 100) },
    { id: 'categorii', art: 'salt', cap: '5 CATEGORII', name: 'Gust de toate', how: 'Rețete în 5 categorii diferite.', goal: size('categories', 5) },
    { id: 'foto', art: 'pie', lvl: 10, cap: 'CU POZĂ', name: 'Arată bine', how: '10 rețete cu poză.', goal: count('photos', 10) },
  ]),
  ...stamps('La gătit', 'cook', [
    { id: 'prima', art: 'plate', cap: 'AM GĂTIT', name: 'Prima la masă', how: 'Prima rețetă gătită până la capăt în modul de gătit.', goal: count('cooked') },
    { id: 'g10', art: 'pot', lvl: 10, cap: '10 MESE', name: 'Gospodar', how: '10 mese gătite din aplicație.', goal: count('cooked', 10) },
    { id: 'g25', art: 'pot', lvl: 25, cap: '25 MESE', name: 'Bucătăria plină', how: '25 de mese gătite din aplicație.', goal: count('cooked', 25) },
    { id: 'g50', art: 'pot', lvl: 50, cap: '50 MESE', name: 'Cuptor încins', how: '50 de mese gătite din aplicație.', goal: count('cooked', 50) },
    { id: 'casei', art: 'bowl', lvl: 5, cap: 'DE 5 ORI', name: 'Rețeta casei', how: 'Aceeași rețetă gătită de 5 ori.', goal: most('cook:', 5) },
    { id: 'pas', art: 'whisk', cap: 'PAS CU PAS', name: 'Pas cu pas', how: 'O rețetă dusă până la ultimul pas în modul de gătit.', goal: count('cookmode') },
    { id: 'maini', art: 'bubble', cap: 'CU VOCEA', name: 'Fără mâini', how: 'Un pas schimbat cu vocea, în modul mâini libere.', goal: count('handsfree') },
    { id: 'jongler', art: 'timer', lvl: 3, cap: 'CRONOMETRE', name: 'Jongler', how: '3 cronometre pornite în același timp.', goal: count('timers', 3) },
    { id: 'nota', art: 'notepad', cap: 'NOTIȚĂ', name: 'Nota bucătarului', how: 'Prima notiță lăsată după ce ai gătit.', goal: count('notes') },
    { id: 'dubla', art: 'cup', cap: 'PORȚII', name: 'Porție dublă', how: 'Numărul de porții schimbat la o rețetă.', goal: count('servings') },
  ]),
  ...stamps('Plan și caiet', 'plan', [
    { id: 'saptamana', art: 'calendar', lvl: 7, cap: '7 ZILE', name: 'Săptămâna e gata', how: 'Cina planificată pentru toate cele 7 zile ale unei săptămâni.', goal: count('week') },
    { id: 'cos', art: 'basket', cap: 'COȘ PLIN', name: 'Coșul plin', how: 'Toată lista de cumpărături bifată.', goal: count('shopping') },
    { id: 'pdf', art: 'cookbook', cap: 'CAIET PDF', name: 'Caietul de rețete', how: 'Primul caiet de rețete PDF, făcut din Profil.', goal: count('cookbook') },
    { id: 'tipar', art: 'printer', cap: 'DE TIPAR', name: 'Ediție tipărită', how: 'Un caiet A4, de tipar, cu cel puțin 20 de rețete.', goal: count('print') },
  ]),
  ...stamps('Familie', 'family', [
    { id: 'casa', art: 'envelope', cap: 'INVITAȚIE', name: 'Casa plină', how: 'Pe cineva invitat în aplicație.', goal: count('invited') },
    { id: 'impartim', art: 'gift', cap: 'PARTAJATĂ', name: 'Împărțim', how: 'O rețetă partajată cu toate conturile.', goal: count('shared') },
    { id: 'an', art: 'cake', lvl: 1, cap: 'UN AN', name: 'Un an împreună', how: 'Un an de la prima ta rețetă sau poveste.',
      goal: (s, now) => [s.since ? Math.floor((now.getTime() - Date.parse(s.since)) / 86_400_000) : 0, 365] },
  ]),
  ...stamps('Surprize', 'secret', [
    { id: 'noapte', art: 'moon', cap: 'DUPĂ 23', secret: true, name: 'Bucătar de noapte', how: 'Modul de gătit deschis după ora 23.', goal: count('night') },
    { id: 'brunch', art: 'pancakes', cap: 'DUMINICĂ', secret: true, name: 'Brunch de duminică', how: 'Ceva gătit duminică înainte de ora 11.', goal: count('brunch') },
    { id: 'dulce', art: 'cupcake', lvl: 10, cap: 'DESERTURI', secret: true, name: 'Dinte dulce', how: '10 rețete de desert.', goal: count('desserts', 10) },
  ]),

  ...stickers('La ascultat', [
    { id: 'k-star', art: 'star', listen: true, name: 'Steluța', how: 'O poveste ascultată până la capăt.', goal: count('listened') },
    { id: 'k-moon', art: 'moon', listen: true, name: 'Luna', how: '5 povești ascultate până la capăt.', goal: count('listened', 5) },
    { id: 'k-book', art: 'book', listen: true, name: 'Cărțulia', how: '10 povești ascultate până la capăt.', goal: count('listened', 10) },
    { id: 'k-owl', art: 'owl', listen: true, name: 'Bufnița', how: '25 de povești ascultate până la capăt.', goal: count('listened', 25) },
    { id: 'k-crown', art: 'crown', listen: true, name: 'Coroana', how: '50 de povești ascultate până la capăt.', goal: count('listened', 50) },
    { id: 'k-whale', art: 'whale', listen: true, name: 'Balena', how: '100 de povești ascultate până la capăt.', goal: count('listened', 100) },
    { id: 'k-rainbow', art: 'rainbow', listen: true, name: 'Curcubeul', how: 'Aceeași poveste ascultată de 3 ori.', goal: most('listen:', 3) },
    { id: 'k-rocket', art: 'rocket', listen: true, name: 'Racheta', how: 'Câte o poveste ascultată din fiecare folder.',
      goal: (s) => { const all = s.sets.allFolders ?? []; const heard = new Set(s.sets.folders ?? []); return [all.filter((f) => heard.has(f)).length, Math.max(2, all.length)] } },
    { id: 'k-cloud', art: 'cloud', listen: true, name: 'Norișorul', how: 'Mai multe povești la rând, până s-a oprit singur playerul.', goal: count('sleepstop') },
    { id: 'k-balloon', art: 'balloon', name: 'Balonul', how: 'O poveste salvată pe telefon, pentru drum fără internet.', goal: count('offline') },
    { id: 'k-ghost', art: 'ghost', listen: true, secret: true, name: 'Stafia', how: 'Povești ascultate după ora 21, în 7 seri diferite.', goal: size('evenings', 7) },
    { id: 'k-fox', art: 'fox', listen: true, name: 'Vulpița', how: 'O poveste ascultată dimineața, înainte de ora 9.', goal: count('morning') },
    { id: 'k-snail', art: 'snail', listen: true, name: 'Melcul', how: 'O poveste lungă, de peste 20 de minute, ascultată până la capăt.', goal: count('long') },
    { id: 'k-bunny', art: 'bunny', listen: true, name: 'Iepurașul', how: '5 povești scurte, sub 5 minute, ascultate până la capăt.', goal: count('short', 5) },
    { id: 'k-parrot', art: 'parrot', listen: true, name: 'Papagalul', how: 'O poveste înregistrată de voi, ascultată de 5 ori.', goal: most('rec:', 5) },
    { id: 'k-umbrella', art: 'umbrella', listen: true, name: 'Umbrela', how: 'O poveste ascultată fără internet, de pe telefon.', goal: count('offlineListen') },
    { id: 'k-comet', art: 'comet', listen: true, name: 'Cometa', how: '200 de povești ascultate până la capăt.', goal: count('listened', 200) },
    // Surprises on the calendar: they come right away, not held for the evening's one sticker.
    { id: 'k-snow', art: 'snow', secret: true, name: 'Fulgul de nea', how: 'O poveste ascultată de Crăciun.', goal: count('xmas') },
    { id: 'k-pumpkin', art: 'pumpkin', secret: true, name: 'Dovlecelul', how: 'O poveste ascultată de Halloween.', goal: count('halloween') },
  ]),
  ...stickers('La făcut povești', [
    { id: 'k-heart', art: 'heart', name: 'Inimioara', how: 'Prima poveste înregistrată cu vocea voastră.', goal: count('source:recording') },
    { id: 'k-wand', art: 'wand', name: 'Bagheta', how: 'Prima poveste scrisă cu AI și citită de un narator.', goal: count('source:generated') },
    { id: 'k-shell', art: 'shell', name: 'Scoica', how: 'Prima poveste încărcată dintr-un fișier audio.', goal: count('source:upload') },
    { id: 'k-crayon', art: 'crayon', name: 'Creionul', how: 'O copertă aleasă sau desenată pentru o poveste.', goal: count('covers') },
    { id: 'k-house', art: 'house', name: 'Căsuța', how: 'Primul folder de povești.', goal: count('folders') },
    { id: 'k-mushroom', art: 'mushroom', name: 'Ciupercuța', how: '10 povești în bibliotecă.', goal: count('stories', 10) },
    { id: 'k-tree', art: 'tree', name: 'Copacul', how: '25 de povești în bibliotecă.', goal: count('stories', 25) },
    { id: 'k-castle', art: 'castle', name: 'Castelul', how: '50 de povești în bibliotecă.', goal: count('stories', 50) },
    { id: 'k-teddy', art: 'teddy', name: 'Ursulețul', how: 'Modul copil pornit prima dată.', goal: count('kid') },
  ]),
  ...stickers('Obiceiuri bune', [
    { id: 'k-cat', art: 'cat', listen: true, name: 'Pisicuța', how: 'Povești ascultate 3 seri la rând.', goal: (s) => [longestRun(s.sets.days ?? []), 3] },
    { id: 'k-dragon', art: 'dragon', listen: true, name: 'Dragonul', how: 'Povești ascultate 7 seri la rând.', goal: (s) => [longestRun(s.sets.days ?? []), 7] },
    { id: 'k-key', art: 'key', name: 'Cheița', how: 'Prima poveste pusă la favorite.', goal: count('favorite') },
    { id: 'k-penguin', art: 'penguin', listen: true, name: 'Pinguinul', how: '10 povești ascultate în modul copil.', goal: count('kidListen', 10) },
  ]),
]

export const BADGE = new Map(BADGES.map((b) => [b.id, b]))
export const STAMPS = BADGES.filter((b) => b.kind === 'stamp')
export const STICKERS = BADGES.filter((b) => b.kind === 'sticker')
