import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { Story } from '../lib/types'
import { useSpineArt } from '../lib/coverTint'
import { useCoverUrl } from '../lib/useCoverUrl'
import { bookMeta, bookVars, moonDust, nextFrame, primeClick, shelfClick, spineHeight, spineWidth, wait } from '../lib/shelf'
import { CoverPicture, SpineFace, type BookViewProps } from './Spine'

type Arrival = { id: string; phase: 'zero' | 'room' | 'drop' }
const GAP = 3

function ShelfSpine({ story, on, width, height, arrival, wob }: { story: Story; on: boolean; width: number; height: number; arrival?: Arrival['phase']; wob?: number }) {
  const { thumb, tint } = useSpineArt(story)
  const cls = `shelf-spine spine-skin${on ? ' on' : ''}${arrival === 'drop' ? ' drop' : ''}${wob ? ' wob' : ''}`
  return (
    <button type="button" className={cls} data-id={story.id} aria-label={story.title} aria-pressed={on}
      style={{ ...bookVars(story, tint), width, height, ['--dir' as string]: wob ?? 0 }}>
      <SpineFace story={story} url={thumb} />
    </button>
  )
}

function WindowCover({ story, isNew, onOpen }: { story: Story; isNew: boolean; onOpen: () => void }) {
  const url = useCoverUrl(story.coverKey)
  return (
    <button type="button" className="vit-cover" onClick={onOpen} aria-label={`Ascultă „${story.title}”`}>
      <CoverPicture key={story.id} story={story} url={url} className="vit-pic" />
      {isNew && <span className="vit-new">Nouă</span>}
    </button>
  )
}

/**
 * "Raft cu vitrină": the books stand on shelves with their spines out and the chosen one's cover
 * sits in the window above (left, with the phone sideways). Keep a finger on the spines and slide:
 * the book under the finger is chosen. ‹ › next to the cover step to the neighbouring book.
 */
export default function BookShelf({ items, selId, onSelect, onOpen, arriving, onArrived, wide }: BookViewProps) {
  const [now, setNow] = useState<Arrival>()
  const [wob, setWob] = useState<Record<string, number>>({})
  const [arrived, setArrived] = useState<string[]>([])
  const hidden = arriving.filter((id) => id !== now?.id)
  const list = items.filter((s) => !hidden.includes(s.id))
  const sel = list.find((s) => s.id === selId) ?? list[0]
  const idx = sel ? list.indexOf(sel) : -1

  // The latest values for the gesture handlers and the arrival sequence, which outlive a render.
  const latest = useRef({ list, sel, items, arriving, onSelect, onArrived })
  useLayoutEffect(() => { latest.current = { list, sel, items, arriving, onSelect, onArrived } })
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  // Room on the shelves: the width sets how many books fit on a shelf, the height (sideways) how tall they are.
  const shelves = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = shelves.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [wide])
  const full = wide ? Math.max(110, Math.min(240, box.h - 50)) : 146
  const widthOf = (s: Story) => (now?.id === s.id && now.phase === 'zero' ? 0 : spineWidth(s))

  const rows: Story[][] = []
  if (wide) rows.push(list)
  else {
    let cur: Story[] = [], used = 0
    for (const s of list) {
      const w = spineWidth(s) + GAP
      if (used + w > box.w - 20 && cur.length) { rows.push(cur); cur = []; used = 0 }
      cur.push(s); used += w
    }
    if (cur.length) rows.push(cur)
  }

  // Sideways all books stand on one long shelf that slides to keep the chosen one in sight.
  const track = useRef<HTMLDivElement>(null)
  const pan = useRef(0)
  useLayoutEffect(() => {
    const t = track.current
    if (!wide || !t || !sel) return
    const el = t.querySelector<HTMLElement>(`[data-id="${CSS.escape(sel.id)}"]`)
    const vw = t.parentElement?.clientWidth ?? 0
    if (!el || !vw) return
    const left = el.offsetLeft, right = left + spineWidth(sel)
    let p = pan.current
    if (left - p < 40) p = left - 40
    if (right - p > vw - 40) p = right - vw + 40
    let total = 20
    for (const s of list) total += spineWidth(s) + GAP
    pan.current = Math.max(0, Math.min(p, total - vw))
    t.style.transform = `translateX(${-pan.current}px)`
  })

  const pick = (id: string | undefined) => {
    if (!id || id === latest.current.sel?.id) return
    onSelect(id)
    shelfClick()
  }
  const step = (d: number) => { const l = latest.current; const i = l.sel ? l.list.indexOf(l.sel) : 0; pick(l.list[i + d]?.id) }

  // ---------- Gestures on the spines ----------
  const drag = useRef<{ x: number; moved: boolean; start?: string; picked: boolean }>(undefined)
  const edge = useRef<{ dir: number; timer?: number }>({ dir: 0 })
  const stopEdge = () => { clearInterval(edge.current.timer); edge.current = { dir: 0 } }
  useEffect(() => stopEdge, [])
  const idAt = (e: PointerEvent) => (document.elementFromPoint(e.clientX, e.clientY)?.closest('.shelf-spine') as HTMLElement | null)?.dataset.id
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (now) return
    primeClick()
    e.currentTarget.setPointerCapture(e.pointerId)
    const id = idAt(e)
    const picked = !!id && id !== latest.current.sel?.id
    drag.current = { x: e.clientX, moved: false, start: id, picked }
    pick(id)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return
    d.moved = true
    pick(idAt(e))
    if (!wide) return
    // Near the end of the shelf it keeps going by itself.
    const r = e.currentTarget.getBoundingClientRect()
    const dir = e.clientX < r.left + 36 ? -1 : e.clientX > r.right - 36 ? 1 : 0
    if (dir !== edge.current.dir) {
      stopEdge()
      if (dir) edge.current = { dir, timer: window.setInterval(() => step(dir), 150) }
    }
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = undefined
    stopEdge()
    // A tap on the book that was already chosen opens it.
    if (e.type === 'pointerup' && d && !d.moved && !d.picked && d.start && d.start === latest.current.sel?.id) onOpen(latest.current.sel)
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

  // Upright, the window is pinned at the top; it gets a background only once the shelves pass under it.
  const vitrine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = vitrine.current
    if (wide || !el) return
    let frame = 0
    const check = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(el).top) || 0
      el.classList.toggle('stuck', window.scrollY > 0 && el.getBoundingClientRect().top <= top + 1)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [wide, !!sel])

  // ---------- A new book is put on the shelf ----------
  const busy = useRef(false)
  useEffect(() => {
    const id = arriving[0]
    if (busy.current || !id || !items.some((s) => s.id === id)) return
    busy.current = true
    ;(async () => {
      setNow({ id, phase: 'zero' })
      latest.current.onSelect(id)
      await nextFrame()
      if (!live.current) return
      setNow({ id, phase: 'room' }) // the books move apart
      await wait(380)
      if (!live.current) return
      setNow({ id, phase: 'drop' }) // and it drops in from above
      await wait(520)
      if (!live.current) return
      const el = shelves.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      const row = el?.closest('.shelf-row')
      if (el && row) {
        const mates = [...row.querySelectorAll<HTMLElement>('.shelf-spine')].map((b) => b.dataset.id!)
        const at = mates.indexOf(id), next: Record<string, number> = {}
        mates.forEach((m, i) => { if (i !== at && Math.abs(i - at) <= 2) next[m] = i < at ? -1 : 1 })
        setWob(next)
        const b = el.getBoundingClientRect(), r = row.getBoundingClientRect()
        moonDust(row.querySelector('.dust-layer'), b.left + b.width / 2 - r.left, b.bottom - r.top - 4)
      }
      await wait(560)
      if (!live.current) return
      setWob({})
      setNow(undefined)
      setArrived((a) => [...a, id])
      busy.current = false
      latest.current.onArrived(id)
    })()
  }, [arriving, items])

  if (!sel) return null
  return (
    <div className={`bookshelf${wide ? ' wide' : ''}`}>
      <div className="vitrine" ref={vitrine}>
        <button type="button" className="vit-nav" disabled={idx <= 0 || !!now} onClick={() => step(-1)} aria-label="Povestea dinainte">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <WindowCover story={sel} isNew={arrived.includes(sel.id) || now?.id === sel.id} onOpen={() => onOpen(sel)} />
        <button type="button" className="vit-nav" disabled={idx >= list.length - 1 || !!now} onClick={() => step(1)} aria-label="Povestea următoare">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="vit-text" aria-live="polite">
          <b>{sel.title}</b>
          <small>{now?.id === sel.id ? 'Nouă pe raft' : bookMeta(sel)}</small>
        </div>
      </div>
      <div className="shelves" ref={shelves} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {rows.map((row, r) => (
          <div key={r} className="shelf-row">
            <div className="shelf-track" ref={wide ? track : undefined}>
              {row.map((s) => (
                <ShelfSpine key={s.id} story={s} width={widthOf(s)} height={spineHeight(s.title, full)}
                  on={s.id === sel.id && (now?.id !== s.id || now.phase === 'drop')}
                  arrival={now?.id === s.id ? now.phase : undefined} wob={wob[s.id]} />
              ))}
            </div>
            <div className="dust-layer" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  )
}
