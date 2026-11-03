import type { SkyPhase } from '../lib/sun'

// The stories background: a sky that follows the real daylight (see lib/sun.ts).
// All three skies are drawn and stacked; CSS fades in the one named by data-sky on <html>,
// so the change at sunset is a slow cross-fade. Plain SVG strings: static art, no state.

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
const sparkle = (x: number, y: number, s: number, fill: string, o = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" opacity="${o}" fill="${fill}" d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z"/>`
const cloud = (x: number, y: number, s: number, fill: string, o = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${o}" d="M0 30a18 18 0 0 1 14-28 24 24 0 0 1 44-2 18 18 0 0 1 30 12 14 14 0 0 1 2 18z"/>`
const crescent = (x: number, y: number, r: number, fill: string, id: string) => `
  <mask id="${id}"><rect x="${x - r - 2}" y="${y - r - 2}" width="${2 * r + 4}" height="${2 * r + 4}" fill="#fff"/><circle cx="${x + r * 0.45}" cy="${y - r * 0.32}" r="${r * 0.86}" fill="#000"/></mask>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" mask="url(#${id})"/>`
const tree = (x: number, y: number, s: number, fill: string) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><rect x="-2" y="-6" width="4" height="10"/><circle cx="0" cy="-16" r="12"/></g>`
const house = (x: number, y: number, s: number, wall: string, roof: string, win: string) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="7" cy="-8" r="22" fill="${win}" opacity=".12"/>
    <rect x="-14" y="-18" width="28" height="22" fill="${wall}"/>
    <path d="M-18-17 0-34 18-17z" fill="${roof}"/>
    <rect x="6" y="-30" width="5" height="9" fill="${roof}"/>
    <rect x="3" y="-12" width="8" height="8" rx="1" fill="${win}"/>
    <rect x="-9" y="-10" width="7" height="14" fill="${roof}"/>
  </g>`

const LOOK: Record<SkyPhase, { sky: [string, string]; hills: [string, string, string]; house: [string, string, string]; tree: string }> = {
  day: { sky: ['#78bff9', '#d6eeff'], hills: ['#a6dba4', '#82c78e', '#63b27c'], house: ['#fff3dc', '#e0735e', '#ffd76a'], tree: '#4b9a68' },
  dusk: { sky: ['#2f2878', '#9a5a88'], hills: ['#6a4a9a', '#4f387f', '#372a66'], house: ['#2a2058', '#1e1847', '#ffd76a'], tree: '#2a2058' },
  night: { sky: ['#121541', '#2c2370'], hills: ['#3a2c86', '#2a2170', '#1c1752'], house: ['#1c1752', '#141043', '#ffd76a'], tree: '#141043' },
}

const glow = (id: string, inner: string, mid: string, a = .95, b = .4) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${inner}" stop-opacity="${a}"/><stop offset=".35" stop-color="${mid}" stop-opacity="${b}"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>`

/** Full-screen layer: the sky itself plus light decoration, the same on every stories screen. */
function backdrop(p: SkyPhase) {
  const [top, bottom] = LOOK[p].sky
  const defs = `<linearGradient id="sky-${p}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`
  const art = p === 'day' ? cloud(-30, 470, 1.5, '#fff', .7) + cloud(290, 640, 1.1, '#fff', .6)
    : p === 'dusk' ? stars(30, 380)
    : stars(90, 852) + sparkle(48, 420, .5, '#ffd76a', .7) + sparkle(360, 560, .45, '#ffd76a', .6) + sparkle(120, 720, .35, '#fff6d6', .6)
  return `<svg viewBox="0 0 ${W} 852" preserveAspectRatio="xMidYMin slice" width="100%" height="100%"><defs>${defs}</defs><rect width="${W}" height="852" fill="url(#sky-${p})"/>${art}</svg>`
}

/** The picture at the top of Acasă: sun or moon over hills with a little house. Scrolls away with the page. */
function scene(p: SkyPhase) {
  const L = LOOK[p]
  let defs = '', sky = ''
  if (p === 'day') {
    defs = glow('sun-day', '#fff2b0', '#ffd76a')
    sky = `<circle cx="335" cy="100" r="95" fill="url(#sun-day)"/><circle cx="335" cy="100" r="26" fill="#ffd76a"/>` + cloud(200, 118, 1, '#fff', .95) + cloud(-20, 140, .8, '#fff', .8)
  } else if (p === 'dusk') {
    defs = glow('sun-dusk', '#fff2b0', '#ffb36a')
    sky = `<circle cx="300" cy="190" r="120" fill="url(#sun-dusk)"/><circle cx="300" cy="196" r="28" fill="#ffbe6a"/>` + cloud(170, 120, 1.1, '#ffb3a0', .5) + cloud(-20, 150, 1, '#c98ab5', .4)
  } else {
    defs = glow('moon-halo', '#ffd76a', '#ffd76a', .3, .15)
    sky = `<circle cx="335" cy="100" r="78" fill="url(#moon-halo)"/>` + crescent(335, 100, 26, '#ffe39a', 'moon-cut') +
      sparkle(250, 70, .45, '#fff6d6', .8) + sparkle(290, 150, .3, '#ffd76a', .8) + cloud(210, 120, .8, '#fff', .07)
  }
  const [h0, h1, h2] = L.hills
  const land = `
    <path fill="${h0}" d="M0 196C70 166 140 160 210 182S330 194 393 168V340H0z"/>
    <path fill="${h1}" d="M0 228C90 200 170 206 240 226S350 236 393 218V340H0z"/>
    <path fill="${h2}" d="M0 262C80 238 170 236 250 256S350 270 393 258V340H0z"/>` +
    tree(40, 214, .9, h1) + tree(62, 220, .7, h1) + tree(206, 210, .75, h1) +
    tree(336, 228, .9, h1) + tree(264, 226, .7, h1) + house(300, 230, 1.05, ...L.house)
  return `<svg viewBox="0 0 ${W} 340" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><defs>${defs}</defs>${sky}${land}</svg>`
}

const BACKDROPS = PHASES.map((p) => [p, backdrop(p)] as const)
const SCENES = PHASES.map((p) => [p, scene(p)] as const)

export function SkyBackdrop() {
  return (
    <div className="sky-backdrop" aria-hidden="true">
      {BACKDROPS.map(([p, svg]) => <div key={p} className="sky-layer" data-phase={p} dangerouslySetInnerHTML={{ __html: svg }} />)}
    </div>
  )
}

export function SkyScene() {
  return (
    <div className="sky-scene" aria-hidden="true">
      {SCENES.map(([p, svg]) => <div key={p} className="sky-layer" data-phase={p} dangerouslySetInnerHTML={{ __html: svg }} />)}
    </div>
  )
}
