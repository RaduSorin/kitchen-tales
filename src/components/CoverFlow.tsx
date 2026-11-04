import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import type { Story } from '../lib/types'
import { useSpineArt } from '../lib/coverTint'
import { useCoverUrl } from '../lib/useCoverUrl'
import { bookMeta, bookVars, moonDust, NATIVE_SWITCH, nextFrame, primeClick, shelfClick, spineWidth, tickAllowed, wait } from '../lib/shelf'
import { CoverPicture, SpineFace, type BookViewProps } from './Spine'

type Arrival = { id: string; phase: 'enter' | 'float' | 'slot' }
const GAP = 16, SPACE = 2, FLOOR = 46, STEP = 34

/** Where each book stands, from the middle of the stage, when book `sel` is the one facing us. */
function positions(list: Story[], sel: number, w: number) {
  const xs: number[] = new Array(list.length)
  xs[sel] = 0
  let x = -(w / 2 + GAP)
  for (let k = sel - 1; k >= 0; k--) { const d = spineWidth(list[k]); xs[k] = x - d / 2; x -= d + SPACE }
  x = w / 2 + GAP
  for (let k = sel + 1; k < list.length; k++) { const d = spineWidth(list[k]); xs[k] = x + d / 2; x += d + SPACE }
  return xs
}

function FlowCover({ story, isNew }: { story: Story; isNew: boolean }) {
  const url = useCoverUrl(story.coverKey)
  return <div className="ff ff-front"><CoverPicture story={story} url={url} className="ff-pic" />{isNew && <span className="flow-new">Nouă</span>}</div>
}

/**
 * One book. Only the few books near the middle (which can turn to face us) get a cover, back and
 * pages; the others are just a spine and the top of the pages, to keep the iPhone's memory free.
 */
function FlowBook({ story, style, full, isNew, shine }: { story: Story; style: CSSProperties; full: boolean; isNew: boolean; shine: boolean }) {
  const { thumb, tint } = useSpineArt(story)
  return (
    <div className={`flow-book${shine ? ' shine' : ''}`} data-id={story.id} style={{ ...bookVars(story, tint), ...style }} aria-hidden="true">
      {full && <><FlowCover story={story} isNew={isNew} /><div className="ff ff-back" /><div className="ff ff-edge" /></>}
      <div className="ff ff-spine spine-skin"><SpineFace story={story} url={thumb} /></div>
      <div className="ff ff-top" />
    </div>
  )
}

/**
 * Cover Flow with books: the chosen book faces you, the others stand with their spines out, in 3D.
 * Hold and drag and the books pass under your finger one by one; tap left or right of the cover for
 * the neighbouring book, or on the cover to listen.
 */
export default function CoverFlow({ items, selId, onSelect, onOpen, arriving, onArrived, wide }: BookViewProps) {
  const [now, setNow] = useState<Arrival>()
  const [shine, setShine] = useState(false)
  const [arrived, setArrived] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const hidden = arriving.filter((id) => id !== now?.id)
  const list = items.filter((s) => !hidden.includes(s.id))
  const found = list.findIndex((s) => s.id === selId)
  const selIdx = found < 0 ? 0 : found
  const sel = list[selIdx]

  const latest = useRef({ list, sel, items, arriving, onSelect, onArrived })
  useLayoutEffect(() => { latest.current = { list, sel, items, arriving, onSelect, onArrived } })
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const flow = useRef<HTMLLabelElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = flow.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [wide])
  const W = Math.round(wide ? Math.max(110, Math.min(230, box.h - FLOOR - 40)) : Math.max(140, Math.min(210, box.w * .52)))

  // While a new book floats in, the shelf opens up where it will go.
  const layoutSel = now?.phase === 'float' ? Math.max(0, list.findIndex((s) => s.id === now.id)) : selIdx
  const xs = positions(list, layoutSel, W)
  // Only the books on screen (and a little beyond, so they are ready when they slide in) are drawn.
  const reach = (box.w || 900) / 2 + W
  const drawn = (s: Story, i: number) => Math.abs(xs[i]) < reach || now?.id === s.id
  const styleFor = (s: Story, i: number): CSSProperties => {
    if (now?.id === s.id && now.phase === 'enter') return { transform: 'translateX(0px) translateY(-380px) translateZ(240px) rotateX(-28deg) rotateY(-24deg)', opacity: 0, transition: 'none', zIndex: 400 }
    if (now?.id === s.id && now.phase === 'float') return { transform: `translateX(0px) translateY(${-Math.min(60, W * .3)}px) translateZ(110px) rotateX(0deg) rotateY(0deg)`, zIndex: 400, transition: 'transform .85s cubic-bezier(.2, .9, .25, 1), opacity .35s' }
    const slot = now?.id === s.id && now.phase === 'slot' ? { transition: 'transform .75s cubic-bezier(.34, 1.36, .5, 1)' } : undefined
    const zIndex = 200 - Math.abs(i - layoutSel)
    if (i === layoutSel) return { transform: 'translateX(0px) translateY(-6px) translateZ(64px) rotateX(0deg) rotateY(0deg)', zIndex, ...slot }
    return { transform: `translateX(${xs[i]}px) translateY(0px) translateZ(${-W / 2}px) rotateX(0deg) rotateY(90deg)`, zIndex, ...slot }
  }

  /** Chooses a book; false when it was already the chosen one (or there is none). */
  const pick = (id: string | undefined) => {
    if (!id || id === latest.current.sel?.id) return false
    onSelect(id)
    shelfClick()
    return true
  }
  const step = (d: number) => { const l = latest.current; const i = l.sel ? l.list.indexOf(l.sel) : 0; return pick(l.list[i + d]?.id) }

  // ---------- Gestures ----------
  const drag = useRef<{ x: number; idx: number; moved: boolean }>(undefined)
  const down = (e: PointerEvent<HTMLLabelElement>) => {
    if (now) return
    tickNext.current = false
    primeClick()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, idx: selIdx, moved: false }
  }
  const move = (e: PointerEvent<HTMLLabelElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) > 8) { d.moved = true; setDragging(true) }
    if (d.moved) pick(list[Math.max(0, Math.min(list.length - 1, d.idx - Math.round(dx / STEP)))]?.id)
  }
  // The stage is the label of a hidden switch: the tap's click (after pointerup) flips it and an
  // iPhone ticks, but only if the tap chose or opened a book.
  const tickNext = useRef(false)
  const up = (e: PointerEvent<HTMLLabelElement>) => {
    const d = drag.current
    drag.current = undefined
    setDragging(false)
    tickNext.current = false
    if (e.type !== 'pointerup' || !d) return
    if (d.moved) { tickNext.current = list[d.idx]?.id !== latest.current.sel?.id; return }
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2
    if (x < -W / 2) tickNext.current = step(-1)
    else if (x > W / 2) tickNext.current = step(1)
    else if (sel) { onOpen(sel); tickNext.current = true }
  }
  const click = (e: MouseEvent<HTMLLabelElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return // the switch's own click, passed up
    if (!tickAllowed(tickNext.current)) e.preventDefault()
    tickNext.current = false
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return
      if (e.key === 'ArrowLeft') { step(-1); e.preventDefault() }
      else if (e.key === 'ArrowRight') { step(1); e.preventDefault() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  // ---------- A new book is put on the shelf ----------
  const busy = useRef(false)
  useEffect(() => {
    const id = arriving[0]
    if (busy.current || !id || !items.some((s) => s.id === id)) return
    busy.current = true
    ;(async () => {
      const all = latest.current.items, waiting = latest.current.arriving
      const pos = all.findIndex((s) => s.id === id)
      // The book it will stand next to.
      const before = all.slice(0, pos).reverse().find((s) => !waiting.includes(s.id)) ?? all.slice(pos + 1).find((s) => !waiting.includes(s.id))
      // 1. Glide to the spot where it goes.
      if (before && before.id !== latest.current.sel?.id) { latest.current.onSelect(before.id); await wait(520) }
      if (!live.current) return
      // 2. It floats in face-on above the shelf, which opens up for it, and sparkles.
      setNow({ id, phase: 'enter' })
      await nextFrame()
      if (!live.current) return
      setNow({ id, phase: 'float' })
      await wait(850)
      setShine(true)
      await wait(650)
      if (!live.current) return
      // 3. It turns its spine to us and slides into its place.
      setShine(false)
      setNow({ id, phase: 'slot' })
      if (before) latest.current.onSelect(before.id)
      await wait(560)
      const el = flow.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      if (el && flow.current) {
        const b = el.getBoundingClientRect(), r = flow.current.getBoundingClientRect()
        moonDust(flow.current.querySelector('.dust-layer'), b.left + b.width / 2 - r.left, r.height - FLOOR)
      }
      await wait(420)
      if (!live.current) return
      // 4. And turns to face us again.
      setNow(undefined)
      latest.current.onSelect(id)
      shelfClick()
      setArrived((a) => [...a, id])
      busy.current = false
      latest.current.onArrived(id)
    })()
  }, [arriving, items])

  if (!sel) return null
  const fresh = now && now.phase !== 'enter'
  const caption = fresh ? list.find((s) => s.id === now.id) : sel
  return (
    <div className={`cover-flow${wide ? ' wide' : ''}`}>
      <label className={`flow-stage${dragging ? ' dragging' : ''}`} ref={flow} style={{ '--w': `${W}px`, '--floor': `${FLOOR}px` } as CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}>
        <input {...NATIVE_SWITCH} />
        <div className="flow-floor" aria-hidden="true" />
        {list.map((s, i) => drawn(s, i) && (
          <FlowBook key={s.id} story={s} style={styleFor(s, i)} full={Math.abs(i - layoutSel) <= 3 || now?.id === s.id}
            isNew={arrived.includes(s.id) || now?.id === s.id} shine={shine && now?.id === s.id} />
        ))}
        <div className="dust-layer" aria-hidden="true" />
      </label>
      <div className={`flow-caption${fresh ? ' fresh' : ''}`} aria-live="polite">
        <b>{fresh ? 'Poveste nouă!' : sel.title}</b>
        <small>{fresh ? caption?.title : bookMeta(sel)}</small>
      </div>
      {/* Screen readers and keyboards get plain buttons for what the gestures do. */}
      <div className="sr-only">
        <button type="button" onClick={() => step(-1)}>Povestea dinainte</button>
        <button type="button" onClick={() => onOpen(sel)}>Ascultă „{sel.title}”</button>
        <button type="button" onClick={() => step(1)}>Povestea următoare</button>
      </div>
    </div>
  )
}
