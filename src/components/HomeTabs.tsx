import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Under the picture on both Acasă screens (design A1 "Topit în poză"): three tabs on the dark end
 * of the photo, the same segmented control as on a recipe, and the open tab's lists right below.
 * The page scrolls as usual. The open tab is kept for this visit (`memory`), so coming back from a
 * recipe or a story lands on the same tab.
 *
 * Tapping a tab whose lists are longer than the screen slides the page up until the tabs sit
 * under the clock, where they stay while scrolling (the concept's "same page, after Caiet"). A
 * short tab leaves the picture where it is, so it never ends in an empty screen.
 */
export type HomeTab = { key: string; label: string; body: ReactNode }

export default function HomeTabs({ tabs, memory, label }: { tabs: HomeTab[]; memory: string; label: string }) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(memory) ?? tabs[0].key } catch { return tabs[0].key }
  })
  const current = tabs.find((t) => t.key === open) ?? tabs[0]
  const box = useRef<HTMLDivElement>(null)
  const tapped = useRef(false)
  const pick = (key: string) => {
    tapped.current = true
    setOpen(key)
    try { sessionStorage.setItem(memory, key) } catch { /* storage unavailable */ }
  }
  useEffect(() => {
    if (!tapped.current) return
    tapped.current = false
    const frame = requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      const stuckAt = parseFloat(getComputedStyle(el).getPropertyValue('--tabs-top')) || 0
      const target = el.getBoundingClientRect().top + window.scrollY - stuckAt
      const room = document.documentElement.scrollHeight - window.innerHeight
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (room >= target - 4) window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])
  // Once the tabs reach the clock they get a solid backing, so the lists don't show through.
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const el = box.current?.firstElementChild
      if (!el) return
      const top = parseFloat(getComputedStyle(el).top) || 0
      setStuck(getComputedStyle(el).position === 'sticky' && el.getBoundingClientRect().top <= top + 1)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])
  return (
    <div className={'home-tabs' + (stuck ? ' stuck' : '')} ref={box}>
      <div className="seg-tabs" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`${memory}-${t.key}`} aria-controls={`${memory}-${t.key}-panel`}
            aria-selected={t.key === current.key} className={t.key === current.key ? 'on' : ''} onClick={() => pick(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="home-tab-panel" role="tabpanel" id={`${memory}-${current.key}-panel`} aria-labelledby={`${memory}-${current.key}`}>
        {current.body}
      </div>
    </div>
  )
}
