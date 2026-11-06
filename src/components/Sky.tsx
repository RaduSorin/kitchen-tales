import type { SkyPhase } from '../lib/sun'

// The live sky on the recipes Acasă story card: it follows the real daylight (see lib/sun.ts).
// Plain SVG strings: static art, no state.

const W = 393
const PHASES: SkyPhase[] = ['day', 'dusk', 'night']

let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
function stars(n: number, maxY: number) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * maxY, r = 0.5 + rnd() * 1.1, o = 0.25 + rnd() * 0.6
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${o.toFixed(2)}"/>`
  }
  return `<g fill="#fff6d6">${s}</g>`
}
const cloud = (x: number, y: number, s: number, fill: string, o = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${o}" d="M0 30a18 18 0 0 1 14-28 24 24 0 0 1 44-2 18 18 0 0 1 30 12 14 14 0 0 1 2 18z"/>`
const crescent = (x: number, y: number, r: number, fill: string, id: string) => `
  <mask id="${id}"><rect x="${x - r - 2}" y="${y - r - 2}" width="${2 * r + 4}" height="${2 * r + 4}" fill="#fff"/><circle cx="${x + r * 0.45}" cy="${y - r * 0.32}" r="${r * 0.86}" fill="#000"/></mask>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" mask="url(#${id})"/>`
const tree = (x: number, y: number, s: number, fill: string) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><rect x="-2" y="-6" width="4" height="10"/><circle cx="0" cy="-16" r="12"/></g>`
const house = (x: number, y: number, s: number, wall: string, roof: string, win: string, halo: number) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="7" cy="-8" r="22" fill="${win}" opacity="${halo}"/>
    <rect x="-14" y="-18" width="28" height="22" fill="${wall}"/>
    <path d="M-18-17 0-34 18-17z" fill="${roof}"/>
    <rect x="6" y="-30" width="5" height="9" fill="${roof}"/>
    <rect x="3" y="-12" width="8" height="8" rx="1" fill="${win}"/>
    <rect x="-9" y="-10" width="7" height="14" fill="${roof}"/>
  </g>`

const LOOK: Record<SkyPhase, { sky: [string, string]; hills: [string, string, string]; house: [string, string, string, number]; tree: string }> = {
  day: { sky: ['#78bff9', '#d6eeff'], hills: ['#a6dba4', '#82c78e', '#63b27c'], house: ['#fff3dc', '#e0735e', '#ffd76a', 0], tree: '#4b9a68' },
  dusk: { sky: ['#2f2878', '#9a5a88'], hills: ['#6a4a9a', '#4f387f', '#372a66'], house: ['#2a2058', '#1e1847', '#ffd76a', .12], tree: '#2a2058' },
  night: { sky: ['#121541', '#2c2370'], hills: ['#3a2c86', '#2a2170', '#1c1752'], house: ['#1c1752', '#141043', '#ffd76a', .12], tree: '#141043' },
}

const glow = (id: string, inner: string, mid: string, a = .95, b = .4) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${inner}" stop-opacity="${a}"/><stop offset=".35" stop-color="${mid}" stop-opacity="${b}"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>`

/** A small version for the story card on the recipes Acasă: sky, sun or moon, low hills with the house. */
function card(p: SkyPhase) {
  const L = LOOK[p]
  const [h0, h1, h2] = L.hills
  const sky = p === 'day' ? `<circle cx="300" cy="50" r="22" fill="#ffd76a"/>` + cloud(196, 34, .7, '#fff', .9) + cloud(330, 96, .5, '#fff', .8)
    : p === 'dusk' ? stars(10, 80) + `<circle cx="290" cy="150" r="70" fill="url(#card-glow)"/><circle cx="290" cy="152" r="22" fill="#ffbe6a"/>`
    : stars(40, 200) + crescent(300, 52, 22, '#ffe39a', 'card-moon')
  return `<svg viewBox="0 0 360 200" preserveAspectRatio="xMaxYMax slice" width="100%" height="100%">
    <defs><linearGradient id="card-${p}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.sky[0]}"/><stop offset="1" stop-color="${L.sky[1]}"/></linearGradient>
    ${glow('card-glow', '#fff2b0', '#ffb36a')}</defs>
    <rect width="360" height="200" fill="url(#card-${p})"/>${sky}
    <path fill="${h0}" d="M150 160C200 136 250 132 300 146S350 150 360 140V200H150z"/>
    <path fill="${h1}" d="M190 178C240 160 290 158 330 168S355 172 360 166V200H190z"/>
    ${tree(214, 168, .6, h0)}${tree(342, 160, .7, h2)}${house(300, 166, .8, ...L.house)}
    <path fill="${h2}" d="M120 200C180 184 260 182 360 190V200z"/>
  </svg>`
}
const CARDS = Object.fromEntries(PHASES.map((p) => [p, card(p)])) as Record<SkyPhase, string>

/** Sky picture for a card; `phase` picks which one, since the recipes side has no data-sky. */
export function SkyCard({ phase }: { phase: SkyPhase }) {
  return <span className="sky-card" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CARDS[phase] }} />
}
