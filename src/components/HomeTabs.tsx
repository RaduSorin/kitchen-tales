import { useState, type ReactNode } from 'react'

/**
 * Under the picture on both Acasă screens (design A1 "Topit în poză"): three tabs on the dark end
 * of the photo, the same segmented control as on a recipe, and the open tab's lists right below.
 * The page scrolls as usual: the tabs and the picture scroll away with it. The open tab is kept for
 * this visit (`memory`), so coming back from a recipe or a story lands on the same tab.
 */
export type HomeTab = { key: string; label: string; body: ReactNode }

export default function HomeTabs({ tabs, memory, label }: { tabs: HomeTab[]; memory: string; label: string }) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(memory) ?? tabs[0].key } catch { return tabs[0].key }
  })
  const current = tabs.find((t) => t.key === open) ?? tabs[0]
  const pick = (key: string) => {
    setOpen(key)
    try { sessionStorage.setItem(memory, key) } catch { /* storage unavailable */ }
  }
  return (
    <div className="home-tabs">
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
