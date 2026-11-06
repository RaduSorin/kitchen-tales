import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import type { Story } from '../lib/types'
import { useCoverUrl } from '../lib/useCoverUrl'
import { moonDust, NATIVE_SWITCH, nextFrame, primeClick, shelfClick, tickAllowed, wait } from '../lib/shelf'
import { getPosition } from '../lib/stories'
import { CoverPicture, type BookViewProps } from './Spine'

/** Under the cover: time left (or the length) and how to browse. */
function flowMeta(s: Story) {
  const pos = getPosition(s.id), total = s.durationSec ?? 0
  const left = pos > 5 && total > pos ? `Mai sunt ${Math.max(1, Math.round((total - pos) / 60))} min` : total ? `${Math.max(1, Math.round(total / 60))} min` : ''
  return [left, 'glisează stânga-dreapta'].filter(Boolean).join(' · ')
}

type Arrival = { id: string; phase: 'enter' | 'float' | 'slot' }

/**
 * Where each cover stands, from the middle of the stage, when cover `sel` faces us: the
 * neighbours tilt away on both sides and overlap like a fanned deck (design "Seară de lux").
 */
function positions(list: Story[], sel: number, w: number) {
  return list.map((_, k) => {
    const d = k - sel
    return d === 0 ? 0 : Math.sign(d) * (w * 0.52 + (Math.abs(d) - 1) * w * 0.2)
  })
}

function FlowCover({ story, isNew }: { story: Story; isNew: boolean }) {
  const url = useCoverUrl(story.coverKey)
  return <div className="ff ff-front"><CoverPicture story={story} url={url} className="ff-pic" />{isNew && <span className="flow-new">Nouă</span>}</div>
}

/** One cover; the stage draws only the covers on screen, to keep the iPhone's memory free. */
function FlowBook({ story, style, isNew, shine }: { story: Story; style: CSSProperties; isNew: boolean; shine: boolean }) {
  return (
    <div className={`flow-book flat${shine ? ' shine' : ''}`} data-id={story.id} style={style} aria-hidden="true">
      <FlowCover story={story} isNew={isNew} />
    </div>
  )
}

/**
 * Cover Flow: the chosen cover faces you, the others tilt away on both sides, with a reflection
 * under them. Hold and drag and the covers pass under your finger one by one; tap left or right
 * of the cover for the neighbouring one, or on the cover (or Ascultă) to listen.
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
  const W = Math.round(wide ? Math.max(110, Math.min(230, box.h / 1.5)) : Math.max(150, Math.min(250, box.w * .6)))
  // Dragging this far moves one cover; under the covers there is room for their reflection.
  const STEP = W * .22, FLOOR = Math.round(W * .36)

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
    if (i === layoutSel) return { transform: 'translateX(0px) translateY(0px) translateZ(0px) rotateX(0deg) rotateY(0deg)', zIndex, ...slot }
    const left = i < layoutSel
    return { transform: `translateX(${xs[i]}px) translateY(0px) translateZ(${-W * .42}px) rotateX(0deg) rotateY(${left ? 62 : -62}deg)`, zIndex, ...slot }
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
        moonDust(flow.current.querySelector('.dust-layer'), b.left + b.width / 2 - r.left, b.bottom - r.top)
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
      <label className={`flow-stage${dragging ? ' dragging' : ''}`} ref={flow} style={{ '--w': `${W}px`, '--floor': `${FLOOR}px`, height: wide ? undefined : W + FLOOR + 24 } as CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}>
        <input {...NATIVE_SWITCH} />
        {list.map((s, i) => drawn(s, i) && (
          <FlowBook key={s.id} story={s} style={styleFor(s, i)}
            isNew={arrived.includes(s.id) || now?.id === s.id} shine={shine && now?.id === s.id} />
        ))}
        <div className="dust-layer" aria-hidden="true" />
      </label>
      <div className={`flow-caption${fresh ? ' fresh' : ''}`} aria-live="polite">
        <b>{fresh ? 'Poveste nouă!' : sel.title}</b>
        <small>{fresh ? caption?.title : flowMeta(sel)}</small>
      </div>
      {!fresh && (
        <button type="button" className="sa-hero-btn flow-play" onClick={() => onOpen(sel)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
          {getPosition(sel.id) > 5 ? 'Continuă' : 'Ascultă'}
        </button>
      )}
      {/* Screen readers and keyboards get plain buttons for what the gestures do. */}
      <div className="sr-only">
        <button type="button" onClick={() => step(-1)}>Povestea dinainte</button>
        <button type="button" onClick={() => step(1)}>Povestea următoare</button>
      </div>
    </div>
  )
}
