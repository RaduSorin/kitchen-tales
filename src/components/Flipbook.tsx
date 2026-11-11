// A book turned page by page: the notebook of stickers and the culinary passport.
// One page at a time; swipe, tap near an edge, the arrows below or the arrow keys turn it.
// The turning leaf is a copy of the page that folds over the spine (WAAPI), so the page
// underneath is already the new one; reduced motion swaps pages without the fold.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'

export type BookPage = {
  key: string
  /** What the pager shows under the book. */
  label: string
  node: ReactNode
  /** The back of the leaf while this page turns (plain paper by default). */
  back?: ReactNode
}

export type BookHandle = {
  /** Turns to page k, riffling through the pages between; resolves once there. */
  goTo: (k: number) => Promise<void>
  index: () => number
}

type Turn = { from: number; to: number; dur: number }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = 'cubic-bezier(.45, .05, .3, 1)'

export default function Flipbook({ pages, start = 0, className, label, edges, aside, ref }: {
  pages: BookPage[]
  start?: number
  className?: string
  /** For screen readers: what the book is. */
  label: string
  /** The two colors of the page edges stacked on the right (how many pages are left). */
  edges: [string, string]
  /** Drawn over the book (the spiral) and beside it (the chapter tabs), told the current page. */
  aside?: (index: number, goTo: (k: number) => void) => ReactNode
  ref?: Ref<BookHandle>
}) {
  const last = pages.length - 1
  const [index, setIndex] = useState(() => Math.min(start, last))
  const [turn, setTurn] = useState<Turn>()
  const at = useRef(index)
  const target = useRef(index)
  const waiters = useRef<(() => void)[]>([])
  const leaf = useRef<HTMLDivElement>(null)
  const shade = useRef<HTMLDivElement>(null)
  const i = Math.min(index, last)

  const settle = useCallback(() => {
    if (at.current !== target.current) return
    waiters.current.splice(0).forEach((w) => w())
  }, [])

  /** One step towards the target, quicker while riffling through several pages. */
  const step = useCallback(() => {
    const from = at.current, to = target.current
    if (from === to) { settle(); return }
    const next = from + (to > from ? 1 : -1)
    if (reducedMotion()) {
      at.current = to
      setIndex(to)
      settle()
      return
    }
    setTurn({ from, to: next, dur: Math.abs(to - from) > 1 ? 300 : 640 })
  }, [settle])

  const goTo = useCallback((k: number) => new Promise<void>((done) => {
    const kk = Math.max(0, Math.min(last, k))
    target.current = kk
    waiters.current.push(done)
    if (at.current === kk && !turn) { settle(); return }
    if (!turn) step()
  }), [last, step, settle, turn])

  useImperativeHandle(ref, () => ({ goTo, index: () => at.current }), [goTo])

  // Animate the leaf of the turn in progress, then move on (or stop at the target).
  useLayoutEffect(() => {
    if (!turn || !leaf.current) return
    const fwd = turn.to > turn.from
    const frames = fwd ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }] : [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }]
    const a = leaf.current.animate(frames, { duration: turn.dur, easing: EASE, fill: 'forwards' })
    shade.current?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: turn.dur })
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      at.current = turn.to
      setIndex(turn.to)
      setTurn(undefined)
    }
    a.finished.then(end, end)
    return () => { gone = true; a.cancel() }
  }, [turn])

  // After a turn ends, take the next step (riffling) or let the waiters go.
  useEffect(() => { if (!turn) step() }, [turn, step])

  const user = (k: number) => { if (!turn) void goTo(k) }
  const swipe = useRef<{ x: number; moved: boolean }>({ x: 0, moved: false })
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swipe.current.moved) return
    if ((e.target as HTMLElement).closest('button, a')) return
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width
    if (i === 0 || x > 0.6) user(i + 1)
    else if (x < 0.4) user(i - 1)
  }

  // The page underneath: the new one while turning forward, the current one while turning back.
  const under = turn ? (turn.to > turn.from ? turn.to : turn.from) : i
  const top = turn ? (turn.to > turn.from ? turn.from : turn.to) : undefined
  const left = last - (turn ? Math.max(turn.from, turn.to) : i)
  const shadow = [...Array.from({ length: Math.min(left, 6) }, (_, k) => `${(k + 1) * 1.6}px ${(k + 1) * 0.6}px 0 0 ${edges[k % 2]}`), '0 18px 30px -12px rgb(0 0 0 / .7)'].join(',')
  const where = pages[turn ? turn.to : i]
  const inner = pages.length > 2 && (turn ? turn.to : i) > 0 && (turn ? turn.to : i) < last

  return (
    <div className={`fb ${className ?? ''}`}>
      <div className="fb-desk">
        <div
          className="fb-stage" role="group" aria-roledescription="carte" aria-label={label} tabIndex={0} style={{ boxShadow: shadow }}
          onKeyDown={(e) => { if (e.key === 'ArrowRight') user(i + 1); if (e.key === 'ArrowLeft') user(i - 1) }}
          onPointerDown={(e) => { swipe.current = { x: e.clientX, moved: false } }}
          onPointerUp={(e) => { const dx = e.clientX - swipe.current.x; if (Math.abs(dx) > 40) { swipe.current.moved = true; user(dx < 0 ? i + 1 : i - 1) } }}
          onClickCapture={(e) => { if (swipe.current.moved) { e.stopPropagation(); e.preventDefault() } }}
          onClick={onClick}
        >
          <div className="fb-page" key={pages[under].key}>{pages[under].node}</div>
          <div className="fb-shade" ref={shade} aria-hidden="true" />
          {top !== undefined && (
            <div className="fb-leaf" ref={leaf} aria-hidden="true" inert style={turn && turn.to < turn.from ? { transform: 'rotateY(-180deg)' } : undefined}>
              <div className="fb-face">{pages[top].node}</div>
              <div className="fb-face fb-back">{pages[top].back}</div>
            </div>
          )}
          {aside?.(turn ? turn.to : i, user)}
        </div>
      </div>
      <div className="fb-pager">
        <button type="button" className="fb-arrow" aria-label="Pagina din urmă" disabled={i === 0} onClick={() => user(i - 1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="fb-where" aria-live="polite">
          <b>{where.label}</b>
          <span>{inner ? `pagina ${(turn ? turn.to : i)} din ${last - 1}` : ' '}</span>
        </div>
        <button type="button" className="fb-arrow" aria-label="Pagina următoare" disabled={i === last} onClick={() => user(i + 1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  )
}
