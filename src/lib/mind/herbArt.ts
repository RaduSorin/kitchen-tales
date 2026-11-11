// The herbarium's drawings: one pressed plant per Răgaz plant, drawn in a 100×100 box with the
// stem ending near (50, 94). Everything is SVG markup made here, from our own constants only.

const f = (n: number) => Math.round(n * 10) / 10
const rad = (deg: number) => (deg * Math.PI) / 180

const stem = (d: string, c = '#6b7f55', w = 1.6) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`

/** A pointed leaf from (x, y), `len` long and `w` wide, turned `deg` from straight up. */
function leaf(x: number, y: number, len: number, w: number, deg: number, col: string, vein = true) {
  const d = `M0 0C${w} ${-len / 3} ${w} ${(-len * 2) / 3} 0 ${-len}C${-w} ${(-len * 2) / 3} ${-w} ${-len / 3} 0 0Z`
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)})"><path d="${d}" fill="${col}" opacity=".92"/>${vein ? `<path d="M0 0V${f(-len * 0.85)}" stroke="rgb(0 0 0 / .18)" stroke-width=".7"/>` : ''}</g>`
}

/** A round flower: `n` petals around (x, y). */
function bloom(x: number, y: number, n: number, out: number, len: number, w: number, col: string, mid?: string, midR = 0) {
  let s = ''
  for (let i = 0; i < n; i++) s += `<ellipse cx="${f(x)}" cy="${f(y - out)}" rx="${f(w)}" ry="${f(len)}" fill="${col}" opacity=".9" transform="rotate(${f((360 / n) * i)} ${f(x)} ${f(y)})"/>`
  return s + (mid ? `<circle cx="${f(x)}" cy="${f(y)}" r="${midR}" fill="${mid}"/>` : '')
}

/** A point `r` away from (x, y) at `deg` (0 = right). */
const at = (x: number, y: number, r: number, deg: number): [number, number] => [x + r * Math.cos(rad(deg)), y + r * Math.sin(rad(deg))]

const PLANTS: Record<string, () => string> = {
  trifoi: () => stem('M50 94C53 78 46 66 50 54') + [-90, 30, 150].map((a) => {
    const [x, y] = at(50, 44, 11, a)
    return `<g transform="rotate(${a + 90} ${f(x)} ${f(y)})"><path d="M${f(x)} ${f(y + 9)}c-12-4-12-18-5-19 3-.5 5 2 5 4 0-2 2-4.5 5-4 7 1 7 15-5 19z" fill="#6f9a5c" opacity=".92"/><path d="M${f(x)} ${f(y + 9)}v-12" stroke="#4d7340" stroke-width=".8"/></g>`
  }).join(''),
  lavanda: () => ([[36, 22], [50, 12], [64, 24]] as const).map(([x, y]) =>
    stem(`M50 94Q${f((50 + x) / 2 + (x - 50) * 0.1)} 60 ${x} ${y}`) +
    Array.from({ length: 7 }, (_, i) => `<ellipse cx="${f(x + (i % 2 ? 2.6 : -2.6) + (50 - x) * i * 0.012)}" cy="${y + i * 5}" rx="2.8" ry="4.2" fill="${i % 2 ? '#8a76b8' : '#6f5ea0'}" opacity=".9"/>`).join('')).join(''),
  feriga: () => stem('M50 94C47 70 50 40 57 12', '#4f6b3f') + Array.from({ length: 11 }, (_, i) => {
    const t = i / 10, y = 86 - t * 68, x = 49 + t * t * 7, l = 17 - t * 13
    return `<ellipse cx="${f(x - l / 2)}" cy="${f(y - 2)}" rx="${f(l / 2)}" ry="2.6" fill="#5f7d4e" opacity=".9" transform="rotate(22 ${f(x)} ${f(y)})"/><ellipse cx="${f(x + l / 2)}" cy="${f(y - 2)}" rx="${f(l / 2)}" ry="2.6" fill="#6c8c58" opacity=".9" transform="rotate(-22 ${f(x)} ${f(y)})"/>`
  }).join(''),
  ginkgo: () => stem('M50 94L50 62', '#a8892e') + `<path d="M50 63C30 60 18 46 22 30 34 22 44 27 50 36 56 27 66 22 78 30 82 46 70 60 50 63z" fill="#d9b23c" opacity=".92"/>` +
    [-34, -22, -10, 10, 22, 34].map((a) => `<path d="M50 62L${f(50 + 34 * Math.sin(rad(a)))} ${f(62 - 32 * Math.cos(rad(a)))}" stroke="#b08d24" stroke-width=".6" opacity=".7"/>`).join(''),
  numauita: () => stem('M50 94C50 74 44 58 38 36') + stem('M48 70C54 56 58 46 62 40') + stem('M46 62C50 46 52 36 52 26') +
    ([[38, 32], [52, 22], [63, 37], [47, 44], [57, 52]] as const).map(([x, y]) => bloom(x, y, 5, 4, 3.4, 3.4, '#6f9bd1', '#f2d26a', 1.7)).join(''),
  margareta: () => stem('M50 94C45 76 55 60 50 44') + leaf(48, 80, 18, 5, -50, '#6c8c58') + bloom(50, 33, 13, 12, 10.5, 3.2, '#fbf7ec', '#e0a93b', 5.5).replace(/opacity=".9"/g, 'opacity=".95" stroke="#c9b48a" stroke-width=".5"'),
  musetel: () => stem('M50 94C50 74 46 58 38 40') + stem('M50 80C54 64 60 54 64 42') + stem('M48 66C50 54 52 40 52 28') +
    ([[38, 36, 7], [64, 38, 6], [52, 24, 7.5]] as const).map(([x, y, r]) => bloom(x, y, 11, r * 0.75, r * 0.6, 1.6, '#fbf7ec', '#e8b53a', r * 0.42)).join('') +
    [[46, 82, -40], [52, 74, 40], [44, 60, -45]].map(([x, y, a]) => `<path d="M${x} ${y}l${a < 0 ? -8 : 8} -6m${a < 0 ? 3 : -3} 2l${a < 0 ? -2 : 2} -5" stroke="#7c9a5c" stroke-width="1.2" fill="none"/>`).join(''),
  spic: () => stem('M50 94C51 74 50 58 50 46', '#b8923e') + Array.from({ length: 7 }, (_, i) => {
    const y = 46 - i * 5
    return `<ellipse cx="45.5" cy="${y}" rx="2.8" ry="5.2" fill="#c9a24c" transform="rotate(-24 45.5 ${y})"/><ellipse cx="54.5" cy="${y}" rx="2.8" ry="5.2" fill="#d6b25e" transform="rotate(24 54.5 ${y})"/><path d="M44 ${y - 3}l-7-10M56 ${y - 3}l7-10" stroke="#b8923e" stroke-width=".5"/>`
  }).join('') + `<ellipse cx="50" cy="11" rx="2.8" ry="5.2" fill="#c9a24c"/>`,
  coada: () => stem('M50 94C50 70 49 40 50 10', '#7e9461', 2) + Array.from({ length: 8 }, (_, i) => {
    const y = 84 - i * 9, l = 22 - i * 2.2
    return [-1, 1].map((s) => `<path d="M50 ${y}q${s * l * 0.5} -2 ${s * l} ${f(-6 + i * 0.3)}" fill="none" stroke="#8fa86e" stroke-width="1"/>`).join('') + `<path d="M48 ${y}h4" stroke="#5d6d47" stroke-width="2"/>`
  }).join(''),
  mesteacan: () => stem('M50 94C48 74 54 50 50 20', '#6e5a48', 1.4) + ([[50, 70, -55], [51, 58, 50], [50, 44, -45], [51, 32, 40], [50, 22, 0]] as const)
    .map(([x, y, a]) => leaf(x, y, 16, 7, a, '#a8bf62')).join(''),
  rozmarin: () => stem('M50 94C49 70 51 40 50 12', '#6a6a4a', 1.4) + Array.from({ length: 16 }, (_, i) => {
    const y = 86 - i * 4.6, s = i % 2 ? 1 : -1
    return `<path d="M50 ${f(y)}l${s * 11} ${-6}" stroke="${i % 3 ? '#5f7f63' : '#7a9a7c'}" stroke-width="2.4" stroke-linecap="round"/>`
  }).join(''),
  mac: () => stem('M50 94C57 76 43 62 50 46') + leaf(50, 76, 16, 5, 50, '#7c9460') +
    ([[40, 30, '#d05a42'], [60, 30, '#b8432f'], [50, 22, '#d05a42'], [50, 38, '#b8432f']] as const).map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="12.5" fill="${c}" opacity=".82"/>`).join('') +
    `<circle cx="50" cy="31" r="4.5" fill="#2c2320"/>`,
  fraga: () => stem('M50 94C52 80 48 70 52 58') + stem('M50 84C40 74 34 70 30 62') +
    [-40, 0, 40].map((a) => leaf(30, 62, 15, 6, a - 20, '#6f9a5c')).join('') +
    `<path d="M52 58C42 56 38 40 46 32 50 30 54 30 58 32 66 40 62 56 52 58z" fill="#d6463f"/><path d="M44 32l4 4 4-5 4 5 4-4" fill="none" stroke="#4d7340" stroke-width="2.2" stroke-linejoin="round"/>` +
    ([[48, 40], [54, 42], [50, 47], [56, 49], [46, 49], [52, 53]] as const).map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".9" ry="1.3" fill="#f2d26a"/>`).join(''),
  macese: () => stem('M50 94C48 78 52 60 50 46', '#7a5a3c') + leaf(49, 74, 14, 5, -55, '#6c8c58') + leaf(51, 64, 14, 5, 55, '#6c8c58') +
    bloom(50, 34, 5, 9, 9, 8, '#e8a3b4') + `<circle cx="50" cy="34" r="5" fill="#e9c24a"/>` +
    Array.from({ length: 10 }, (_, i) => { const [x, y] = at(50, 34, 6.5, i * 36); return `<circle cx="${f(x)}" cy="${f(y)}" r=".8" fill="#b8892a"/>` }).join(''),
  papadie: () => stem('M50 94C48 76 52 60 50 44', '#8c8f6a') + Array.from({ length: 20 }, (_, i) => {
    const [x, y] = at(50, 30, 19, i * 18)
    return `<path d="M50 30L${f(x)} ${f(y)}" stroke="#a79c86" stroke-width=".6"/><circle cx="${f(x)}" cy="${f(y)}" r="2.2" fill="#cfc6b2" opacity=".9"/>`
  }).join('') + `<circle cx="50" cy="30" r="3" fill="#8c8f6a"/>`,
  clopotel: () => stem('M50 94C50 70 52 40 64 18') + leaf(50, 82, 16, 4, -35, '#6c8c58') +
    ([[58, 34, 20], [55, 50, -10], [63, 20, 30]] as const).map(([x, y, a]) => `<g transform="rotate(${a} ${x} ${y})"><path d="M${x} ${y}c-8 0-9 8-10 14 3-1 5 1 6 0 2 1 4 1 4-1 1 2 3 1 5 1-1-6-2-14-5-14z" fill="#7b7fc8" opacity=".92"/></g>`).join(''),
  cununa: () => Array.from({ length: 18 }, (_, i) => {
    const deg = 125 + i * 16
    const [x, y] = at(50, 50, 30, deg)
    return leaf(x, y, 15, 5.5, deg + 180 + (i % 2 ? 35 : -35), i % 2 ? '#6e8a52' : '#86a065', false)
  }).join('') + `<path d="M42 82c4 6 12 6 16 0M46 82l-4 8M54 82l4 8" fill="none" stroke="#c9a24c" stroke-width="2" stroke-linecap="round"/>`,
  stejar: () => `<path d="M50 94L50 78C40 79 33 74 38 68 27 66 27 57 36 55 27 49 32 41 40 44 36 33 44 27 50 20 56 27 64 33 60 44 68 41 73 49 64 55 73 57 73 66 62 68 67 74 60 79 50 78z" fill="#b5623a" opacity=".92"/>` +
    stem('M50 92V26', '#7d3f22', 0.9) + `<ellipse cx="62" cy="86" rx="5" ry="6.5" fill="#9a7a3c"/><path d="M56 82h12" stroke="#6a4f22" stroke-width="3.5" stroke-linecap="round"/>`,
  ghiocel: () => stem('M50 94C50 70 50 44 56 24C60 16 66 18 66 26') +
    `<path d="M48 94C40 74 42 54 46 40 50 56 50 76 50 94z" fill="#6c8c58" opacity=".9"/><path d="M66 26c-6 6-6 16-3 22 3-4 4-6 5-6 1 2 3 5 6 6 2-8 0-16-8-22z" fill="#fbf7ec" stroke="#c9c3b0" stroke-width=".6"/><path d="M64 46l2-3 2 3" stroke="#6c8c58" stroke-width="1"/>`,
  vasc: () => stem('M50 94C50 78 50 66 50 56', '#7c8f5a') + stem('M50 60C42 50 36 44 30 34', '#7c8f5a') + stem('M50 60C58 50 64 44 70 34', '#7c8f5a') +
    ([[30, 34, -30], [70, 34, 30], [40, 46, -40], [60, 46, 40]] as const).map(([x, y, a]) => `<ellipse cx="${x}" cy="${y - 9}" rx="4" ry="10" fill="#8fae7a" opacity=".9" transform="rotate(${a} ${x} ${y})"/>`).join('') +
    ([[47, 54], [53, 55], [50, 49]] as const).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#f6f1e2" stroke="#cfc6a8" stroke-width=".5"/>`).join(''),
  brad: () => stem('M50 94C50 70 50 40 50 12', '#6a5040', 1.6) + Array.from({ length: 26 }, (_, i) => {
    const y = 88 - i * 3, s = i % 2 ? 1 : -1, l = 6 + Math.min(i, 26 - i) * 0.9
    return `<path d="M50 ${y}l${f(s * l)} ${f(-l * 0.55)}" stroke="${i % 3 ? '#3f6650' : '#4f7a60'}" stroke-width="1.6" stroke-linecap="round"/>`
  }).join(''),
  viorea: () => stem('M50 94C48 74 44 58 40 40') + stem('M50 94C52 70 58 56 62 44') + `<path d="M46 94C40 76 42 60 50 50 52 66 50 80 48 94z" fill="#6c8c58" opacity=".85"/>` +
    ([[40, 34], [36, 44], [62, 38], [66, 48], [44, 26]] as const).map(([x, y]) => bloom(x, y, 6, 3.6, 3.4, 1.7, '#5f86d6', '#2d3f7a', 1.2)).join(''),
  lalea: () => stem('M50 94C50 76 50 60 50 44', '#6c8c58', 2) + `<path d="M50 92C36 80 32 60 38 44 44 60 48 76 50 92z" fill="#7c9460" opacity=".9"/>` +
    `<path d="M38 24C38 40 44 46 50 46S62 40 62 24L56 30 50 18 44 30z" fill="#d9534a"/><path d="M50 18L44 30 50 46 56 30z" fill="#e7735a" opacity=".85"/>`,
  lacramioara: () => `<path d="M40 94C26 72 30 44 46 30 46 54 46 76 44 94z" fill="#6f9a5c" opacity=".88"/>` + stem('M52 94C52 64 56 36 74 22') +
    ([[55, 52, 5], [58, 42, 4.6], [62, 34, 4.2], [67, 28, 3.8], [72, 24, 3.2]] as const).map(([x, y, r]) =>
      `<path d="M${x} ${y}q5 1 6 ${f(r + 3)}" fill="none" stroke="#6b7f55" stroke-width=".8"/><path d="M${f(x + 6 - r)} ${f(y + r + 3)}a${r} ${r} 0 0 1 ${f(2 * r)} 0l${f(r * 0.2)} ${f(r * 0.9)}l${f(-r * 0.5)} ${f(-r * 0.3)}l${f(-r * 0.5)} ${f(r * 0.4)}l${f(-r * 0.5)} ${f(-r * 0.4)}l${f(-r * 0.5)} ${f(r * 0.3)}z" fill="#fbf7ec" stroke="#cfc6a8" stroke-width=".5"/>`).join(''),
  tei: () => stem('M50 94C50 80 46 70 40 62', '#7a6a40') + `<path d="M40 62C22 60 16 40 30 30 38 26 44 34 44 34 46 26 58 24 62 34 66 48 54 60 40 62z" fill="#9db864" opacity=".92"/><path d="M40 62L42 36" stroke="rgb(0 0 0 / .15)" stroke-width=".7"/>` +
    stem('M46 70C56 56 60 44 62 30', '#9a8a4a', 0.8) + `<path d="M50 66C58 60 66 48 66 36 62 44 56 54 50 66z" fill="#d8d29a" opacity=".85"/>` +
    ([[62, 28], [58, 24], [66, 24], [62, 20]] as const).map(([x, y]) => bloom(x, y, 5, 1.8, 1.8, 1.4, '#e8dc8a', '#b8a24a', 0.8)).join(''),
  sunatoare: () => stem('M50 94C50 70 50 50 50 36') + stem('M50 56C42 46 38 40 34 30') + stem('M50 52C58 44 62 38 66 28') +
    [[50, 74, -50], [50, 74, 50], [50, 62, -50], [50, 62, 50]].map(([x, y, a]) => leaf(x, y, 12, 4, a, '#6f9a5c')).join('') +
    ([[34, 26], [66, 24], [50, 30], [42, 36], [58, 36]] as const).map(([x, y]) => bloom(x, y, 5, 3.6, 3.6, 2.6, '#f2c230', '#d9962a', 1.6)).join(''),
  floarea: () => stem('M50 94C52 78 48 64 50 52', '#6c8c58', 2.2) + leaf(50, 80, 20, 9, -60, '#7c9a4e') + leaf(51, 70, 18, 8, 55, '#7c9a4e') +
    bloom(50, 34, 18, 13, 7, 3, '#f0b72f') + `<circle cx="50" cy="34" r="10" fill="#6b4524"/>` +
    Array.from({ length: 12 }, (_, i) => { const [x, y] = at(50, 34, i < 6 ? 4 : 7.5, i * 60 + (i < 6 ? 0 : 30)); return `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#3d2814"/>` }).join(''),
  vita: () => stem('M50 94C52 82 48 72 50 64', '#7a5a3c') + `<path d="M50 64C38 66 24 58 26 46 20 40 26 30 34 32 34 22 44 18 50 24 56 18 66 22 66 32 74 30 80 40 74 46 76 58 62 66 50 64z" fill="#8a9f4a" opacity=".92"/>` +
    [[50, 64, 50, 26], [50, 64, 30, 40], [50, 64, 72, 40], [50, 64, 36, 56], [50, 64, 66, 56]].map(([a, b, c, d]) => `<path d="M${a} ${b}L${c} ${d}" stroke="rgb(0 0 0 / .16)" stroke-width=".7"/>`).join('') +
    `<path d="M62 70c8 0 10-8 6-10s-6 4-2 6" fill="none" stroke="#7a8a3c" stroke-width="1"/>` +
    ([[30, 74], [35, 74], [32.5, 79], [28, 79], [37.5, 79], [32.5, 84]] as const).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#6a4a7a" opacity=".9"/>`).join(''),
  artar: () => stem('M50 94L50 66', '#9a3a24', 1.2) + `<path d="M50 66L46 70 40 66 30 70 32 60 18 56 24 50 16 40 30 40 30 30 40 36 42 22 48 30 50 14 52 30 58 22 60 36 70 30 70 40 84 40 76 50 82 56 68 60 70 70 60 66 54 70z" fill="#d1622f" opacity=".92"/>` +
    [[50, 66, 50, 18], [50, 66, 22, 44], [50, 66, 78, 44], [50, 66, 32, 64], [50, 66, 68, 64]].map(([a, b, c, d]) => `<path d="M${a} ${b}L${c} ${d}" stroke="rgb(0 0 0 / .16)" stroke-width=".7"/>`).join(''),
}

/** The plant for each month of the year ("01" … "12"), by season. */
export const MONTH_PLANT: Record<string, { art: string; name: string }> = {
  '01': { art: 'brad', name: 'brad' }, '02': { art: 'ghiocel', name: 'ghiocel' }, '03': { art: 'viorea', name: 'viorea' },
  '04': { art: 'lalea', name: 'lalea' }, '05': { art: 'lacramioara', name: 'lăcrămioară' }, '06': { art: 'tei', name: 'tei' },
  '07': { art: 'sunatoare', name: 'sunătoare' }, '08': { art: 'floarea', name: 'floarea-soarelui' }, '09': { art: 'vita', name: 'viță' },
  '10': { art: 'artar', name: 'arțar' }, '11': { art: 'stejar', name: 'stejar' }, '12': { art: 'vasc', name: 'vâsc' },
}

/** A pressed plant with its bit of tape, as it sits on the herbarium's page. */
export function plantSvg(art: string, missing = false) {
  const draw = PLANTS[art]
  if (missing || !draw) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="rgb(74 59 44 / .38)" stroke-width="1.2" stroke-dasharray="3 3" stroke-linecap="round"><path d="M50 94C48 76 52 60 50 44"/><path d="M50 74c-8-2-12-8-12-12 6 0 10 6 12 12z"/><circle cx="50" cy="32" r="13"/></g></svg>`
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${draw()}<rect x="38" y="80" width="24" height="8" fill="#cdb98a" opacity=".7" transform="rotate(-5 50 84)"/></svg>`
}

/** The plant on its own paper card with the name written under it (the moment, and the flight). */
export function cardSvg(art: string, label: string) {
  const draw = PLANTS[art] ?? (() => '')
  return `<svg viewBox="0 0 100 136" aria-hidden="true">
    <rect x="5" y="6" width="94" height="130" rx="3" fill="rgb(0 0 0 / .35)"/><rect x="3" y="3" width="94" height="130" rx="3" fill="#efe6d2"/>
    <rect x="3" y="3" width="94" height="130" rx="3" fill="none" stroke="rgb(74 59 44 / .12)"/>
    <g transform="translate(0 12)">${draw()}</g><rect x="36" y="98" width="28" height="9" fill="#d9c9a0" opacity=".75" transform="rotate(-4 50 102)"/>
    <text x="50" y="124" text-anchor="middle" font-family="Caveat, 'Bradley Hand', cursive" font-weight="600" font-size="13" fill="#4a3b2c">${escapeXml(label)}</text></svg>`
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c)

/** For tests: every drawing the catalogue may ask for. */
export const PLANT_NAMES = Object.keys(PLANTS)
