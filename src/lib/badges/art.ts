// The drawings: kitchen characters inside perforated stamps (recipes) and die-cut stickers with a
// white edge (stories). Each character is an outline path, its colour and the details on top,
// drawn in a 100×100 box. Everything is SVG markup made here, from our own constants only.
import type { Badge, Ink } from './catalog'

const INK_TEXT = '#2b2350'
type Art = { d: string; col: string; det: string; r?: number }

/** Two eyes, a smile and pink cheeks, centred on (x, y). */
const face = (x: number, y: number, s = 1, sleepy = false) => `<g transform="translate(${x} ${y}) scale(${s})">${sleepy
  ? `<path d="M-12 0q4 4 8 0M4 0q4 4 8 0" fill="none" stroke="${INK_TEXT}" stroke-width="2.4" stroke-linecap="round"/>`
  : `<circle cx="-8" cy="0" r="3.2" fill="${INK_TEXT}"/><circle cx="8" cy="0" r="3.2" fill="${INK_TEXT}"/><circle cx="-7" cy="-1.2" r="1" fill="#fff"/><circle cx="9" cy="-1.2" r="1" fill="#fff"/>`}
  <path d="M-5 7q5 5 10 0" fill="none" stroke="${INK_TEXT}" stroke-width="2.4" stroke-linecap="round"/><circle cx="-15" cy="6" r="4" fill="#ff6f8f" opacity=".45"/><circle cx="15" cy="6" r="4" fill="#ff6f8f" opacity=".45"/></g>`

function star(cx: number, cy: number, R: number, r: number, n = 5) {
  let d = ''
  for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n, q = i % 2 ? r : R; d += `${i ? 'L' : 'M'}${(cx + q * Math.sin(a)).toFixed(1)} ${(cy - q * Math.cos(a)).toFixed(1)}` }
  return `${d}Z`
}
const rect = (x: number, y: number, w: number, h: number, r: number) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
const circle = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}Z`

// ---- kitchen characters (stamps) ----
const KITCHEN: Record<string, Art> = {
  pencil: { d: 'M70 8L92 30L38 84L10 92L18 62Z', col: '#ffc94d', det: `<path d="M18 62L38 84L10 92Z" fill="#fff1dc"/><path d="M14 78L22 87L10 92Z" fill="${INK_TEXT}"/><path d="M70 8L92 30L84 38L62 16Z" fill="#ff8fa8"/>${face(56, 46, 0.7)}` },
  globe: { d: circle(50, 50, 40), col: '#7cc4f5', det: `<path d="M24 30c10 2 14 10 10 16s4 12 0 20M66 16c-4 8 4 12 12 12M62 82c2-10 14-10 16-20" fill="none" stroke="#7ed69a" stroke-width="9" stroke-linecap="round"/>${face(50, 52)}` },
  tv: { d: `${rect(10, 22, 80, 62, 12)}M38 22L28 8M62 22L72 8`, col: '#ff8f6b', det: `<path d="M38 22L28 8M62 22L72 8" stroke="${INK_TEXT}" stroke-width="3" stroke-linecap="round"/><rect x="20" y="31" width="60" height="44" rx="7" fill="#fff5e6"/>${face(50, 52)}` },
  camera: { d: `M22 30H34L40 20H60L66 30H78Q88 30 88 40V76Q88 86 78 86H22Q12 86 12 76V40Q12 30 22 30Z`, col: '#c9b6f7', det: `<circle cx="50" cy="58" r="21" fill="#fff"/><circle cx="50" cy="58" r="15" fill="#9fc3e8"/><circle cx="76" cy="40" r="4" fill="#ffd24d"/>${face(50, 57, 0.62)}` },
  mic: { d: `${rect(32, 8, 36, 56, 18)}M24 50q0 26 26 26q26 0 26-26M50 76V92M36 92H64`, col: '#ffb3c7', det: `<path d="M24 50q0 26 26 26q26 0 26-26M50 76V92M36 92H64" fill="none" stroke="#9fc3e8" stroke-width="6" stroke-linecap="round"/><path d="M34 20h32M34 30h32" stroke="#fff" stroke-width="3" opacity=".6"/>${face(50, 42, 0.75)}` },
  fridge: { d: rect(22, 6, 56, 88, 10), col: '#d6e6ff', det: `<path d="M22 38H78" stroke="#9fb6d6" stroke-width="3"/><path d="M68 18v10M68 48v14" stroke="#9fb6d6" stroke-width="4" stroke-linecap="round"/><circle cx="34" cy="20" r="4" fill="#ff7a8a"/><rect x="40" y="16" width="8" height="8" rx="2" fill="#ffd24d" transform="rotate(12 44 20)"/>${face(48, 62)}` },
  toque: { d: 'M26 88L26 58C12 54 8 38 18 28C24 20 36 20 40 24C44 10 62 10 66 24C74 18 88 22 90 34C94 46 84 56 74 58L74 88Z', col: '#fff8ea', det: `<path d="M26 72H74V88H26Z" fill="#ecdcc0"/><path d="M38 60V70M50 62V70M62 60V70" stroke="#ecdcc0" stroke-width="3" stroke-linecap="round"/>${face(50, 46, 0.9)}` },
  salt: { d: 'M30 30Q30 14 50 14Q70 14 70 30L74 84Q74 92 66 92H34Q26 92 26 84Z', col: '#fff8ea', det: `<path d="M30 30Q30 14 50 14Q70 14 70 30Z" fill="#b9c4d6"/><circle cx="42" cy="22" r="1.8" fill="${INK_TEXT}"/><circle cx="50" cy="20" r="1.8" fill="${INK_TEXT}"/><circle cx="58" cy="22" r="1.8" fill="${INK_TEXT}"/>${face(50, 58)}` },
  pie: { d: 'M8 54Q8 30 50 30Q92 30 92 54L86 80Q84 86 78 86H22Q16 86 14 80Z', col: '#e9a45a', det: `<path d="M8 54Q8 30 50 30Q92 30 92 54Z" fill="#f6c97c"/><path d="M22 42l8 6M40 38l6 6M58 38l6 6M74 42l6 6" stroke="#d98a3a" stroke-width="3" stroke-linecap="round"/><path d="M14 58H86" stroke="#d98a3a" stroke-width="3"/><path d="M50 22c-4-6 4-8 0-14M62 24c-4-6 4-8 0-14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>${face(50, 68, 0.85)}` },
  plate: { d: circle(50, 50, 40), col: '#e6efff', det: `<circle cx="50" cy="52" r="29" fill="none" stroke="#bfd0ee" stroke-width="2"/><path d="M30 52C28 36 44 30 54 34C68 30 78 44 72 56C76 70 60 76 50 72C38 76 26 66 30 52Z" fill="#fff"/><circle cx="51" cy="53" r="15" fill="#ffc247"/>${face(51, 52, 0.55)}` },
  pot: { d: 'M30 30Q50 12 70 30L84 30L84 40L94 40L94 52L84 52L84 70Q84 88 66 88L34 88Q16 88 16 70L16 52L6 52L6 40L16 40L16 30Z', col: '#59b8a8', det: `<path d="M16 30L30 30Q50 12 70 30L84 30L84 40L16 40Z" fill="#3d9384"/><circle cx="50" cy="23" r="4.5" fill="#ffd24d"/>${face(50, 62)}` },
  bowl: { d: 'M8 46H92Q92 84 50 88Q8 84 8 46Z', col: '#ff8f6b', det: `<ellipse cx="50" cy="46" rx="42" ry="8" fill="#ffd28a"/><circle cx="34" cy="45" r="3" fill="#7ed69a"/><circle cx="60" cy="44" r="3" fill="#ff5f6d"/><path d="M40 34c-4-6 4-8 0-14M56 34c-4-6 4-8 0-14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>${face(50, 64)}` },
  whisk: { d: 'M50 6C76 6 80 44 62 62L58 92H42L38 62C20 44 24 6 50 6Z', col: '#cfd8e6', det: `<path d="M50 8V60M38 12C30 30 34 50 44 60M62 12C70 30 66 50 56 60" fill="none" stroke="#9fb0c8" stroke-width="2.4"/><rect x="40" y="60" width="20" height="32" rx="6" fill="#ff8f6b"/>${face(50, 36, 0.75)}` },
  bubble: { d: 'M50 10C76 10 92 26 92 46C92 66 76 80 52 80L30 94L34 78C16 72 8 60 8 46C8 26 24 10 50 10Z', col: '#9fe0c0', det: `<path d="M26 32q4-6 10-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>${face(50, 46)}` },
  timer: { d: `${circle(50, 54, 38)}M42 8H58V18H42Z`, col: '#ffd24d', det: `<path d="M42 8H58V18H42Z" fill="#ff8f6b"/><circle cx="50" cy="54" r="29" fill="#fff8ea"/><path d="M50 30V36M74 54H68M26 54H32" stroke="#e0b030" stroke-width="3" stroke-linecap="round"/><path d="M50 54L62 42" stroke="#ff5f6d" stroke-width="3" stroke-linecap="round"/>${face(50, 62, 0.7)}` },
  notepad: { d: rect(16, 10, 68, 82, 8), col: '#fff1a8', det: `<path d="M16 22H84" stroke="#ff8f6b" stroke-width="6"/><path d="M28 70H72M28 80H60" stroke="#d9c26a" stroke-width="3" stroke-linecap="round"/><path d="M30 10V4M50 10V4M70 10V4" stroke="#9fb0c8" stroke-width="4" stroke-linecap="round"/>${face(50, 46)}` },
  cup: { d: 'M18 20H76L72 86Q71 92 64 92H30Q23 92 22 86ZM76 34H88Q94 34 94 42V52Q94 60 86 60H74', col: '#9fc3e8', det: `<path d="M76 34H88Q94 34 94 42V52Q94 60 86 60H74" fill="none" stroke="#7aa6d6" stroke-width="6"/><path d="M26 40H40M26 54H36M26 68H40" stroke="#fff" stroke-width="3" stroke-linecap="round"/>${face(54, 58)}` },
  calendar: { d: rect(12, 16, 76, 76, 10), col: '#fff8ea', det: `<path d="M12 26Q12 16 22 16H78Q88 16 88 26V36H12Z" fill="#ff7a6b"/><path d="M32 8V24M68 8V24" stroke="${INK_TEXT}" stroke-width="5" stroke-linecap="round"/><g fill="#ffd28a"><rect x="22" y="74" width="10" height="8" rx="2"/><rect x="38" y="74" width="10" height="8" rx="2"/><rect x="54" y="74" width="10" height="8" rx="2"/><rect x="70" y="74" width="8" height="8" rx="2"/></g>${face(50, 54)}` },
  basket: { d: 'M10 40H90L80 88Q78 92 72 92H28Q22 92 20 88ZM28 40Q30 10 50 10Q70 10 72 40', col: '#e0a35a', det: `<path d="M28 40Q30 10 50 10Q70 10 72 40" fill="none" stroke="#b97a32" stroke-width="6"/><circle cx="34" cy="34" r="9" fill="#ff5f6d"/><path d="M58 38C58 24 72 22 72 34" fill="#7ed69a"/><path d="M22 60H78M26 76H74" stroke="#c98a42" stroke-width="3"/>${face(50, 66, 0.8)}` },
  cookbook: { d: 'M24 16H74Q84 16 84 26V80Q84 88 76 88H24Q16 88 16 80V24Q16 16 24 16Z', col: '#e8694a', det: `<path d="M22 76H84V80Q84 88 76 88H24Q18 88 22 76Z" fill="#fff5e6"/><path d="M27 16V76" stroke="#c24f33" stroke-width="3"/><path d="M66 16V34L71 29L76 34V16Z" fill="#ffd24d"/>${face(54, 48)}` },
  printer: { d: `M28 10H72V34H28ZM12 34H88Q92 34 92 40V72H8V40Q8 34 12 34ZM26 60H74V92H26Z`, col: '#cfd8e6', det: `<path d="M28 10H72V34H28Z" fill="#fff"/><path d="M26 60H74V92H26Z" fill="#fff"/><path d="M34 70H66M34 80H58" stroke="#ff8f6b" stroke-width="3" stroke-linecap="round"/><circle cx="80" cy="44" r="3" fill="#7ed69a"/>${face(50, 46, 0.7)}` },
  envelope: { d: rect(8, 22, 84, 60, 8), col: '#ffe59a', det: `<path d="M10 26L50 56L90 26" fill="none" stroke="#e0b030" stroke-width="3" stroke-linejoin="round"/><path d="${star(76, 70, 8, 4)}" fill="#ff7a8a"/>${face(46, 68, 0.62)}` },
  gift: { d: rect(14, 34, 72, 58, 8), col: '#b993f5', det: `<path d="M14 34H86V48H14Z" fill="#a07ce8"/><path d="M50 34V92" stroke="#ffd24d" stroke-width="10"/><path d="M50 34C40 16 22 22 30 32ZM50 34C60 16 78 22 70 32Z" fill="#ffd24d"/>${face(32, 68, 0.62)}${face(68, 68, 0.62)}` },
  cake: { d: 'M14 54H86V88H14ZM24 34H76V54H24ZM50 6Q56 16 50 22Q44 16 50 6Z', col: '#ffb3c7', det: `<path d="M24 34H76V54H24Z" fill="#fff8ea"/><path d="M14 54Q24 62 32 54Q41 62 50 54Q59 62 68 54Q77 62 86 54" fill="#fff8ea"/><path d="M50 22V34" stroke="#9fc3e8" stroke-width="4"/><path d="M50 6Q56 16 50 22Q44 16 50 6Z" fill="#ffc247"/>${face(50, 74, 0.8)}` },
  moon: { d: 'M60 12A39 39 0 1 0 88 66A31 31 0 0 1 60 12Z', col: '#ffe59a', det: `${face(42, 54, 0.9, true)}<path d="${star(78, 26, 8, 4)}" fill="#fff"/>` },
  pancakes: { d: 'M10 62Q10 52 50 52Q90 52 90 62V80Q90 90 50 90Q10 90 10 80ZM18 46Q18 36 50 36Q82 36 82 46V52H18Z', col: '#f6c97c', det: `<path d="M10 70Q50 78 90 70" stroke="#d98a3a" stroke-width="3" fill="none"/><path d="M30 34Q50 20 70 34Q72 44 50 42Q28 44 30 34Z" fill="#ffe59a"/><path d="M60 40Q66 50 62 58" stroke="#c96b2a" stroke-width="5" stroke-linecap="round" fill="none"/>${face(46, 64, 0.8)}` },
  cupcake: { d: 'M22 52C12 42 20 28 32 30C34 14 56 10 62 22C76 18 88 32 78 44C84 46 82 52 78 52L72 90L28 90Z', col: '#8fd3ff', det: `<path d="M22 52C12 42 20 28 32 30C34 14 56 10 62 22C76 18 88 32 78 44C84 46 82 52 78 52Z" fill="#ffb3c7"/><circle cx="48" cy="20" r="6" fill="#ff5f6d"/><path d="M38 56L40 88M50 56V88M62 56L60 88" stroke="#6fbdf0" stroke-width="2"/>${face(50, 70, 0.7)}` },
}

// ---- story characters (stickers) ----
const STORY: Record<string, Art> = {
  star: { d: star(50, 52, 40, 21), col: '#ffd24d', det: face(50, 52), r: -7 },
  moon: { ...KITCHEN.moon, r: 6 },
  book: { d: 'M24 20H74Q84 20 84 30V78Q84 86 76 86H24Q16 86 16 78V28Q16 20 24 20Z', col: '#ff8f6b', det: `<path d="M22 74H84V78Q84 86 76 86H24Q18 86 22 74Z" fill="#fff5e6"/><path d="M27 20V74" stroke="#d96a48" stroke-width="3"/>${face(55, 46)}`, r: -4 },
  rainbow: { d: 'M8 76A42 42 0 0 1 92 76L92 80L68 80L68 76A18 18 0 0 0 32 76L32 80L8 80Z', col: '#ff7a8a', det: `<path d="M24 78A26 26 0 0 1 76 78" fill="none" stroke="#ffd24d" stroke-width="8"/><path d="M32 78A18 18 0 0 1 68 78" fill="none" stroke="#7fd0ff" stroke-width="8.5"/>${face(50, 46, 0.62)}`, r: 5 },
  rocket: { d: 'M50 6C68 20 72 42 68 58L82 76L64 72L60 78Q50 100 40 78L36 72L18 76L32 58C28 42 32 20 50 6Z', col: '#8fd3ff', det: `<path d="M41 79Q50 96 59 79Z" fill="#ffb347"/><path d="M68 58L82 76L64 72ZM32 58L18 76L36 72Z" fill="#ff7a8a"/><circle cx="50" cy="40" r="15" fill="#fff"/>${face(50, 39, 0.72)}`, r: 8 },
  heart: { d: 'M50 86C18 62 10 44 19 29C28 15 44 17 50 30C56 17 72 15 81 29C90 44 82 62 50 86Z', col: '#ff8fa8', det: face(50, 46), r: -6 },
  cloud: { d: 'M28 78A17 17 0 0 1 26 44A23 23 0 0 1 70 40A19 19 0 0 1 74 78Z', col: '#d6e6ff', det: `${face(48, 58, 1, true)}<text x="72" y="30" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="15" fill="#fff">z</text><text x="82" y="19" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="11" fill="#fff">z</text>`, r: 4 },
  owl: { d: 'M50 16L33 8L30 26C20 36 18 52 22 66C26 82 38 90 50 90C62 90 74 82 78 66C82 52 80 36 70 26L67 8Z', col: '#b993f5', det: `<ellipse cx="50" cy="70" rx="17" ry="14" fill="#e3d2ff"/><circle cx="38" cy="43" r="12" fill="#fff"/><circle cx="62" cy="43" r="12" fill="#fff"/><circle cx="39" cy="44" r="5.5" fill="${INK_TEXT}"/><circle cx="61" cy="44" r="5.5" fill="${INK_TEXT}"/><circle cx="41" cy="42" r="1.8" fill="#fff"/><circle cx="63" cy="42" r="1.8" fill="#fff"/><path d="M45 53L55 53L50 61Z" fill="#ffb347"/>`, r: -5 },
  crown: { d: 'M16 78L10 32L32 50L50 20L68 50L90 32L84 78Z', col: '#ffc247', det: `<circle cx="10" cy="32" r="5" fill="#ff7a8a"/><circle cx="50" cy="20" r="5" fill="#7fd0ff"/><circle cx="90" cy="32" r="5" fill="#8fe0b0"/>${face(50, 60, 0.9)}`, r: 6 },
  whale: { d: 'M10 56C10 36 28 26 48 26C66 26 78 36 80 50L82 40L94 30L96 48C94 56 88 58 85 62C80 78 64 86 46 86C26 86 10 76 10 56Z', col: '#7cc4f5', det: `<path d="M16 68C26 80 62 84 80 66C74 80 60 86 46 86C32 86 20 80 16 68Z" fill="#d9efff"/>${face(36, 56, 0.85)}`, r: -5 },
  wand: { d: `${star(60, 38, 30, 15)}M42 58L52 68L22 96L12 86Z`, col: '#ffd24d', det: `<path d="M42 58L52 68L22 96L12 86Z" fill="#b993f5"/>${face(60, 39, 0.62)}`, r: 4 },
  shell: { d: 'M50 14C76 14 92 36 88 58L64 80L64 88L36 88L36 80L12 58C8 36 24 14 50 14Z', col: '#ffb7a0', det: `<path d="M50 84L50 18M46 84L28 26M54 84L72 26M42 84L15 46M58 84L85 46" stroke="#f08f78" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="52" rx="22" ry="15" fill="#ffb7a0"/>${face(50, 50, 0.8)}`, r: -6 },
  house: { d: 'M50 8L92 46L80 46L80 88L20 88L20 46L8 46Z', col: '#ffcf7a', det: `<path d="M50 8L92 46L8 46Z" fill="#ff7a6b"/><path d="M43 88V76a7 7 0 0 1 14 0V88Z" fill="#c9843a"/>${face(50, 60, 0.8)}`, r: 5 },
  mushroom: { d: 'M10 52C10 26 30 12 50 12C70 12 90 26 90 52C90 58 84 60 78 60L66 60L68 80C68 88 60 90 50 90C40 90 32 88 32 80L34 60L22 60C16 60 10 58 10 52Z', col: '#fff1dc', det: `<path d="M10 52C10 26 30 12 50 12C70 12 90 26 90 52C90 58 84 60 78 60L22 60C16 60 10 58 10 52Z" fill="#ff6f6f"/><circle cx="32" cy="36" r="7" fill="#fff"/><circle cx="58" cy="28" r="6" fill="#fff"/><circle cx="72" cy="46" r="5" fill="#fff"/>${face(50, 73, 0.68)}`, r: -4 },
  tree: { d: 'M50 8C72 8 88 24 86 44C85 58 74 68 60 70L62 90L38 90L40 70C26 68 15 58 14 44C12 24 28 8 50 8Z', col: '#b9824f', det: `<path d="M50 8C72 8 88 24 86 44C85 60 70 71 50 71C30 71 15 60 14 44C12 24 28 8 50 8Z" fill="#7ed69a"/>${face(50, 42)}`, r: 6 },
  castle: { d: 'M14 88L14 28L24 28L24 38L32 38L32 28L42 28L42 46L58 46L58 28L68 28L68 38L76 38L76 28L86 28L86 88Z', col: '#c9b6f7', det: `<path d="M42 88V76a8 8 0 0 1 16 0V88Z" fill="#7a5fc0"/>${face(50, 60, 0.8)}`, r: -5 },
  crayon: { ...KITCHEN.pencil, col: '#6fd0c0', det: `<path d="M18 62L38 84L10 92Z" fill="#fff1dc"/><path d="M14 78L22 87L10 92Z" fill="${INK_TEXT}"/>${face(58, 44, 0.7)}`, r: 3 },
  balloon: { d: 'M50 8C72 8 86 24 86 42C86 58 72 68 60 72L60 78L63 78L63 92L37 92L37 78L40 78L40 72C28 68 14 58 14 42C14 24 28 8 50 8Z', col: '#c9843a', det: `<path d="M50 8C72 8 86 24 86 42C86 60 66 73 50 73C34 73 14 60 14 42C14 24 28 8 50 8Z" fill="#ff9f5a"/><path d="M50 8C60 20 60 60 50 73C40 60 40 20 50 8Z" fill="#ffd24d" opacity=".7"/>${face(50, 40, 0.9)}`, r: -7 },
  teddy: { d: 'M26 30A12 12 0 1 1 40 20A30 30 0 0 1 60 20A12 12 0 1 1 74 30A32 32 0 0 1 82 54C82 74 68 88 50 88C32 88 18 74 18 54A32 32 0 0 1 26 30Z', col: '#d9a066', det: `<circle cx="28" cy="22" r="5" fill="#f3c9a0"/><circle cx="72" cy="22" r="5" fill="#f3c9a0"/><ellipse cx="50" cy="64" rx="15" ry="12" fill="#f8e3c8"/><circle cx="39" cy="48" r="3.4" fill="${INK_TEXT}"/><circle cx="61" cy="48" r="3.4" fill="${INK_TEXT}"/><ellipse cx="50" cy="59" rx="4.5" ry="3.2" fill="${INK_TEXT}"/><path d="M44 66q6 6 12 0" fill="none" stroke="${INK_TEXT}" stroke-width="2.2" stroke-linecap="round"/>`, r: 5 },
  ghost: { d: 'M50 10C70 10 82 26 82 46L82 90L72 81L61 90L50 81L39 90L28 81L18 90L18 46C18 26 30 10 50 10Z', col: '#f3f0ff', det: face(50, 44), r: -6 },
  fox: { d: 'M12 12L36 30Q50 26 64 30L88 12L82 46Q86 60 74 72L50 88L26 72Q14 60 18 46Z', col: '#ff8f4d', r: -5,
    det: `<path d="M20 20L34 31L24 40Z M80 20L66 31L76 40Z" fill="#7a3b1f" opacity=".55"/><path d="M22 56Q36 58 44 70L50 88L26 72Q18 64 22 56Z M78 56Q64 58 56 70L50 88L74 72Q82 64 78 56Z" fill="#fff5e6"/><circle cx="50" cy="80" r="4" fill="${INK_TEXT}"/>${face(50, 54, 0.85)}` },
  cat: { d: 'M20 42L18 10L40 26Q50 23 60 26L82 10L80 42Q88 54 84 68Q78 88 50 88Q22 88 16 68Q12 54 20 42Z', col: '#ffb35c', r: 5,
    det: `<path d="M23 34L22 18L34 27Z M77 34L78 18L66 27Z" fill="#ff8fa8"/><path d="M42 18L46 30M54 18L52 30" stroke="#e08a3a" stroke-width="3" stroke-linecap="round"/><path d="M10 62H30M12 70L30 66M90 62H70M88 70L70 66" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>${face(50, 58, 0.95)}` },
  dragon: { d: 'M22 88Q10 64 24 46Q22 28 38 18L42 6L50 15L58 8L60 18Q78 20 84 38Q92 56 80 72L94 80L76 84Q64 92 44 90Z', col: '#6fd08f', r: -4,
    det: `<ellipse cx="50" cy="72" rx="20" ry="14" fill="#fff1a8"/><path d="M58 64L66 60M56 72L66 70M52 80L60 80" stroke="#e8c85a" stroke-width="2.4" stroke-linecap="round"/><path d="M84 38Q96 30 98 18Q88 22 80 30Z" fill="#4fae70"/><circle cx="46" cy="32" r="2.5" fill="#4fae70"/><circle cx="64" cy="30" r="2.5" fill="#4fae70"/>${face(54, 44, 0.85)}` },
  snail: { d: `${circle(58, 46, 30)}M14 88Q6 88 6 80L6 52Q6 40 17 40Q28 40 28 52L28 76L86 76Q94 76 94 82Q94 88 86 88ZM12 40L8 26M22 40L26 26`, col: '#ffd9a8', r: 4,
    det: `<path d="M12 40L8 26M22 40L26 26" stroke="#e8b47a" stroke-width="3.5" stroke-linecap="round"/><circle cx="8" cy="25" r="3.5" fill="#e8b47a"/><circle cx="26" cy="25" r="3.5" fill="#e8b47a"/><path d="${circle(58, 46, 30)}" fill="#ff9f7a"/><path d="M58 46m-4 0a4 4 0 1 1 8 0a10 10 0 1 1-20 0a16 16 0 1 1 32 0a22 22 0 1 1-44 0" fill="none" stroke="#e07a5a" stroke-width="3.5" stroke-linecap="round"/>${face(17, 56, 0.55)}` },
  bunny: { d: 'M30 50Q20 20 28 6Q40 2 42 40Q46 38 50 38Q54 38 58 40Q60 2 72 6Q80 20 70 50Q86 58 86 72Q86 90 50 90Q14 90 14 72Q14 58 30 50Z', col: '#f5f0ff', r: -6,
    det: `<path d="M32 44Q26 22 31 12Q36 12 38 40Z M68 44Q74 22 69 12Q64 12 62 40Z" fill="#ffc2d4"/><ellipse cx="50" cy="78" rx="3.4" ry="2.6" fill="#ff8fa8"/>${face(50, 68, 0.95)}` },
  umbrella: { d: 'M8 52Q10 14 50 12Q90 14 92 52Q84 45 76 52Q67 45 58 52Q50 45 42 52Q33 45 24 52Q16 45 8 52ZM50 52V82Q50 92 41 92Q33 92 33 84', col: '#7fd0ff', r: 5,
    det: `<path d="M50 52V82Q50 92 41 92Q33 92 33 84" fill="none" stroke="#c9843a" stroke-width="6" stroke-linecap="round"/><path d="M50 12Q36 22 42 52Q33 45 24 52Q22 26 50 12Z M50 12Q64 22 58 52Q67 45 76 52Q78 26 50 12Z" fill="#ff9fc0"/><path d="M14 66q-3 6 0 8q3-2 0-8M86 66q-3 6 0 8q3-2 0-8M22 80q-3 6 0 8q3-2 0-8" fill="#bfe6ff"/>${face(50, 34, 0.7)}` },
  key: { d: `${circle(30, 42, 24)}M50 36L92 36L92 50L84 50L84 62L72 62L72 50L50 50Z`, col: '#ffc247', r: -8,
    det: `<path d="M56 43H90" stroke="#e0a320" stroke-width="2.4" stroke-linecap="round"/><circle cx="30" cy="42" r="17" fill="#ffd77a"/>${face(30, 42, 0.72)}` },
  parrot: { d: 'M52 10Q76 10 78 36Q80 56 68 70L72 92L60 84L52 94L48 82Q30 78 28 58Q26 40 32 28Q38 10 52 10Z', col: '#5cd08a', r: 6,
    det: `<path d="M44 12Q48 2 56 4Q52 8 54 12Z" fill="#ff6f6f"/><path d="M32 36Q14 38 18 54Q24 46 34 50Z" fill="#ffb347"/><ellipse cx="60" cy="58" rx="14" ry="20" fill="#3fae6e" transform="rotate(-15 60 58)"/><path d="M60 84L72 92L68 70Z" fill="#7fd0ff"/>${face(50, 36, 0.72)}` },
  penguin: { d: 'M50 8Q76 8 80 40Q84 62 78 78L90 88L66 88Q50 92 34 88L10 88L22 78Q16 62 20 40Q24 8 50 8Z', col: '#3f4478', r: -5,
    det: `<ellipse cx="50" cy="62" rx="22" ry="24" fill="#fff"/><ellipse cx="50" cy="34" rx="20" ry="15" fill="#fff"/><path d="M45 44L55 44L50 51Z" fill="#ffb347"/><path d="M28 88L22 92L38 92Z M72 88L78 92L62 92Z" fill="#ffb347"/>${face(50, 34, 0.7)}` },
  comet: { d: `${star(64, 36, 28, 14)}M48 50Q30 72 6 94Q22 66 38 42Z`, col: '#ffd24d', r: 0,
    det: `<path d="M48 50Q30 72 6 94Q22 66 38 42Z" fill="#ff9fc0"/><path d="M44 48Q30 66 12 86" fill="none" stroke="#7fd0ff" stroke-width="4" stroke-linecap="round"/>${face(64, 38, 0.62)}` },
  snow: { d: star(50, 50, 42, 18, 6), col: '#cfeaff', r: 8,
    det: `<path d="M50 14V86M19 32L81 68M19 68L81 32" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/><circle cx="50" cy="50" r="17" fill="#e8f5ff"/>${face(50, 50, 0.7)}` },
  pumpkin: { d: 'M50 24Q54 8 64 8L62 24Q90 24 92 54Q92 88 50 88Q8 88 8 54Q10 24 50 24Z', col: '#ff9f3a', r: -4,
    det: `<path d="M50 24Q54 8 64 8L62 24Z" fill="#6fae4f"/><path d="M34 26Q22 56 34 86M66 26Q78 56 66 86" fill="none" stroke="#e07a1f" stroke-width="3"/>${face(50, 58)}` },
}

const INKS: Record<Ink, string> = { add: '#c9553a', cook: '#2d7470', plan: '#b07a1f', family: '#3a3f8c', secret: '#6b4a7c' }
const PAPER = '#f3e8d2'
let uid = 0
const nextId = () => `bd${(uid++).toString(36)}`

/** A small, steady tilt per badge, so the album looks stuck by hand but never shuffles. */
export function tiltOf(id: string, range = 4) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997
  const t = (h % (2 * range + 1)) - range
  return t || (h % 2 ? 2 : -2)
}

const drawing = (a: Art, x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="${a.d}" fill="rgb(0 0 0 / .25)" transform="translate(0 4)"/><path d="${a.d}" fill="${a.col}" stroke="${a.col}" stroke-width="3" stroke-linejoin="round"/>${a.det}</g>`

/** The round postmark (date in the middle, wavy lines to the right), in currentColor. */
function postmark(cx: number, cy: number, date: Date) {
  const id = nextId()
  const r = 21
  const d = String(date.getDate())
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][date.getMonth()]
  let waves = ''
  for (let k = -1.5; k <= 1.5; k++) waves += `<path d="M${cx + r + 3} ${cy + k * 8}q4.5 -4 9 0t9 0t9 0t9 0t9 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`
  return `<defs><path id="${id}" d="M${cx - 16.2} ${cy}a16.2 16.2 0 1 1 32.4 0a16.2 16.2 0 1 1 -32.4 0"/></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="11.5" fill="none" stroke="currentColor" stroke-width=".9"/>
    <text font-family="Figtree, sans-serif" font-weight="700" font-size="3.9" letter-spacing=".9" fill="currentColor"><textPath href="#${id}">BUCĂTĂRIA CU POVEȘTI · TIMBRU NOU ·</textPath></text>
    <text x="${cx}" y="${cy - 0.5}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="5.6" fill="currentColor">${d} ${roman}</text>
    <text x="${cx}" y="${cy + 5.5}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="600" font-size="4.4" fill="currentColor">${date.getFullYear()}</text>${waves}`
}

function stampBody(b: Badge) {
  const id = nextId()
  const ink = INKS[b.ink ?? 'add']
  const cap = b.cap ?? ''
  let holes = ''
  for (let x = 24; x <= 96; x += 9) holes += `<circle cx="${x}" cy="6" r="2.6"/><circle cx="${x}" cy="118" r="2.6"/>`
  for (let y = 15; y <= 111; y += 9.6) holes += `<circle cx="19" cy="${y.toFixed(1)}" r="2.6"/><circle cx="101" cy="${y.toFixed(1)}" r="2.6"/>`
  const art = KITCHEN[b.art]
  return `<defs><mask id="${id}"><rect width="120" height="124" fill="#fff"/><g fill="#000">${holes}</g></mask></defs>
    <g mask="url(#${id})"><rect x="19" y="6" width="82" height="112" rx="3" fill="${PAPER}"/></g>
    <rect x="27" y="14" width="66" height="76" rx="2" fill="${ink}"/><rect x="30" y="17" width="60" height="70" rx="1" fill="none" stroke="${PAPER}" stroke-width=".8" opacity=".7"/>
    ${art ? drawing(art, 31, 24, 0.58) : ''}
    ${b.lvl ? `<text x="34" y="29" font-family="Fraunces, Georgia, serif" font-weight="600" font-size="12" fill="${PAPER}">${b.lvl}</text>` : ''}
    <text x="60" y="106" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="${cap.length > 11 ? 7 : 8.2}" letter-spacing="${cap.length > 11 ? 0.6 : 1.1}" fill="${ink}">${cap}</text>`
}

/**
 * A stamp. `earned`: with the postmark and its date (the postmark's parts get the `pm` class and
 * the paper the `drop` class, for the arrival animation). Missing: a dashed outline with the
 * character's shape, or a question mark for a surprise.
 */
export function stampSvg(b: Badge, earned?: Date, opts: { wide?: boolean; label?: string } = {}) {
  const tilt = tiltOf(b.id)
  // Same box earned or missing, so a grid of stamps lines up (the postmark sticks out on the right).
  const box = opts.wide ? '-10 -6 190 140' : '0 0 150 124'
  const label = opts.label ?? `${b.name}${earned ? '' : ', lipsă'}`
  if (!earned) {
    const art = KITCHEN[b.art]
    const inner = b.secret
      ? `<text x="60" y="76" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="40" fill="rgb(255 255 255 / .3)">?</text>`
      : art ? `<g transform="translate(32 24) scale(.56)"><path d="${art.d}" fill="none" stroke="rgb(255 255 255 / .28)" stroke-width="2.6" stroke-dasharray="5 5" stroke-linejoin="round"/></g>` : ''
    return `<svg viewBox="${box}" role="img" aria-label="${label}"><g transform="rotate(${tilt} 60 62)"><rect x="19" y="6" width="82" height="112" rx="3" fill="rgb(255 255 255 / .025)" stroke="rgb(255 255 255 / .32)" stroke-width="1.5" stroke-dasharray="4 4"/>${inner}</g></svg>`
  }
  const clip = nextId()
  return `<svg viewBox="${box}" role="img" aria-label="${label}"><g class="bd-shake"><g transform="rotate(${tilt} 60 62)">
    <defs><clipPath id="${clip}"><rect x="19" y="6" width="82" height="112" rx="3"/></clipPath></defs>
    <g class="bd-pm" style="color: rgb(242 200 121 / .75)">${postmark(96, 26, earned)}</g>
    <g class="bd-drop">${stampBody(b)}</g>
    <g clip-path="url(#${clip})"><g class="bd-pm" style="color: rgb(42 28 12 / .8)">${postmark(96, 26, earned)}</g></g>
  </g></g></svg>`
}

/** A stamp without its postmark (small rows, the catalogue). */
export function plainStampSvg(b: Badge) {
  return `<svg viewBox="0 0 120 124" role="img" aria-label="${b.name}"><g transform="rotate(${tiltOf(b.id)} 60 62)">${stampBody(b)}</g></svg>`
}

/** A sticker with a white die-cut edge; missing: a dashed outline of the character (or a ? for a surprise). */
export function stickerSvg(b: Badge, earned: boolean, opts: { label?: string } = {}) {
  const a = STORY[b.art]
  if (!a) return ''
  const r = a.r ?? tiltOf(b.id, 6)
  const label = opts.label ?? `${b.name}${earned ? '' : ', lipsă'}`
  if (!earned) {
    const shape = b.secret ? circle(50, 50, 40) : a.d
    return `<svg viewBox="-6 -6 112 112" role="img" aria-label="${label}"><g transform="rotate(${r} 50 50)"><path d="${shape}" fill="rgb(255 255 255 / .05)" stroke="rgb(255 255 255 / .4)" stroke-width="2.2" stroke-dasharray="5 5" stroke-linejoin="round" stroke-linecap="round"/>${b.secret ? `<text x="50" y="64" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="40" fill="rgb(255 255 255 / .35)">?</text>` : ''}</g></svg>`
  }
  return `<svg viewBox="-6 -6 112 112" role="img" aria-label="${label}"><g transform="rotate(${r} 50 50)">
    <path d="${a.d}" fill="rgb(0 0 0 / .35)" stroke="rgb(0 0 0 / .35)" stroke-width="11" stroke-linejoin="round" transform="translate(0 3)"/>
    <path d="${a.d}" fill="#fff" stroke="#fff" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${a.d}" fill="${a.col}" stroke="${a.col}" stroke-width="3" stroke-linejoin="round"/>${a.det}</g></svg>`
}

export const hasArt = (b: Badge) => !!(b.kind === 'stamp' ? KITCHEN[b.art] : STORY[b.art])
