// A recipe without a photo (design "Seară de lux"): a small gold drawing of a steaming plate on a
// dark card tinted in a warm colour. The tint is picked from the title so each recipe stays
// recognizable. Drawn in a square that keeps its proportions; outside the square the card has the
// tint's dark edge colour, so it fills a thumbnail, a wide card or a hero the same way.
const TINTS = [
  ['#a05a3c', '#24160e'], // terracotta
  ['#5a7846', '#151a11'], // sage
  ['#8c3c50', '#200f15'], // wine
  ['#a07832', '#22180b'], // honey
  ['#46647e', '#10161d'], // dusk blue
  ['#7a4e8c', '#19111e'], // plum
]

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) | 0
  return Math.abs(h)
}

export default function PlatePlaceholder({ seed, className }: { seed: string; className?: string }) {
  const i = hash(seed) % TINTS.length
  const [tint, edge] = TINTS[i]
  const id = `plate-tint-${i}`
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ background: edge }} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="46%" r="50%">
          <stop offset="0" stopColor={tint} stopOpacity=".85" />
          <stop offset="1" stopColor={edge} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <g fill="none" stroke="#f2c879" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="50" cy="55" r="15" />
        <circle cx="50" cy="55" r="9.8" opacity=".6" />
        <path d="M43 38.5c0-2.8 2.8-2.8 2.8-5.6M50 38.5c0-2.8 2.8-2.8 2.8-5.6M57 38.5c0-2.8 2.8-2.8 2.8-5.6" opacity=".8" />
      </g>
    </svg>
  )
}
