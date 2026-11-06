import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A small menu card that opens under the ⋯ button it belongs to (design "Seară de lux"), instead
 * of a sheet from the bottom. Put it inside an element with class `menu-anchor` that also holds
 * the button. It closes on a tap outside, on scroll or with Escape.
 */
export default function PopMenu({ label, onClose, children, className }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    // The ⋯ button itself toggles the menu, so a tap on it is not "outside".
    const outside = (e: PointerEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !t.closest?.('.menu-anchor')) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => document.addEventListener('pointerdown', outside), 0)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', onClose, { passive: true })
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', onClose)
    }
  }, [onClose])
  return <div className={`pop-menu${className ? ` ${className}` : ''}`} ref={box} role="menu" aria-label={label}>{children}</div>
}

/** One line of a menu: its text on the left, a small icon on the right. */
export function MenuRow({ icon, children, onClick, danger, disabled }: { icon?: string; children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  const svg = icon && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
  if (!onClick) return <span className={`menu-row done${danger ? ' danger' : ''}`}>{children}{svg}</span>
  return <button type="button" role="menuitem" className={`menu-row${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>{children}{svg}</button>
}

export const MENU_ICON = {
  share: 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  down: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  text: 'M5 6h14M5 10h14M5 14h10M5 18h7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
}
