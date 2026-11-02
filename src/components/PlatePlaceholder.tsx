// A calm illustrated plate used when a recipe has no photo. Colors are picked from the title so each recipe stays recognizable.
const PALETTES = [
  ['#5d7f62', '#e9e3d3', '#b4543a'],
  ['#c9d3c2', '#f4f1ea', '#6f8f45'],
  ['#efe6d6', '#f3d27a', '#e9b949'],
  ['#cfd8e3', '#f2efe8', '#8b5a3c'],
  ['#3e6a51', '#e3e7de', '#c79a5b'],
  ['#e7d9cf', '#fbf6ee', '#c4553b'],
]

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) | 0
  return Math.abs(h)
}

export default function PlatePlaceholder({ seed, className }: { seed: string; className?: string }) {
  const [bg, plate, food] = PALETTES[hash(seed) % PALETTES.length]
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ background: bg }} aria-hidden="true">
      <rect width="100" height="100" fill={bg} />
      <circle cx="50" cy="52" r="34" fill={plate} />
      <circle cx="50" cy="52" r="24" fill={food} />
      <circle cx="43" cy="46" r="5" fill={bg} opacity=".35" />
      <circle cx="57" cy="58" r="6" fill={bg} opacity=".3" />
    </svg>
  )
}
