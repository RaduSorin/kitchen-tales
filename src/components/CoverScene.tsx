import { useId } from 'react'
import { coverScene } from '../lib/stories'

// Fixed star positions (0-100 box), so every cover's sky looks the same from render to render.
const STARS = Array.from({ length: 9 }, (_, i) => ({ x: (i * 37 + 11) % 100, y: ((i * 53 + 7) % 45) + 4, r: (i % 3) * 0.35 + 0.5, o: 0.35 + (i % 3) * 0.2 }))

/**
 * The illustrated background of a cover without a picture: a sky in the story's colours, a few
 * stars, a soft light behind the emoji and two hills. The emoji (and title) sit on top of it.
 */
export default function CoverScene({ title }: { title: string }) {
  const s = coverScene(title)
  const id = useId().replace(/:/g, '')
  return (
    <svg className="cover-scene" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.top} /><stop offset="1" stopColor={s.bottom} /></linearGradient>
        <radialGradient id={`${id}g`} cx=".5" cy=".42" r=".45"><stop offset="0" stopColor={s.glow} stopOpacity=".75" /><stop offset="1" stopColor={s.glow} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}s)`} />
      {STARS.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="#fff" opacity={t.o} />)}
      <circle cx="50" cy="46" r="42" fill={`url(#${id}g)`} />
      <path d="M0 78Q30 66 55 76T100 72V100H0z" fill={s.hill} opacity=".55" />
      <path d="M0 86Q40 78 70 86T100 84V100H0z" fill={s.hill} opacity=".85" />
    </svg>
  )
}
