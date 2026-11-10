import { useCallback, useRef, useState } from 'react'
import PopMenu, { MENU_ICON, MenuRow } from '../components/PopMenu'
import { Link } from 'react-router-dom'
import { useSyncedList } from '../lib/synced'
import { addShoppingText, shoppingStore } from '../lib/plan'
import { mergeShopping, type ShoppingRow } from '../lib/merge'
import type { ShoppingItem } from '../lib/types'
import { showToast } from '../lib/toast'
import { AISLES, aisleOf } from '../lib/aisles'

// How the list is grouped: by shop aisle (default) or by recipe. Remembered on this device.
const VIEW_KEY = 'kt-shop-view'
type View = 'aisles' | 'recipes'
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'recipes' ? 'recipes' : 'aisles' } catch { return 'aisles' } }

const CART_ICON = 'M3 4.5h2.5l2 10.5h10l2-7.5H7M9 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM16.5 17.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z'

/** Removes items right away and offers to bring them back for a few seconds. */
function removeWithUndo(items: ShoppingItem[], text: string) {
  items.forEach((s) => shoppingStore.remove(s.id))
  showToast(text, () => items.forEach((s) => shoppingStore.create(s)))
}

/** How far a line must be pulled to the left to be deleted (it then goes, with undo). */
const SWIPE_DELETE = 96

/**
 * One line on the list; a merged line (e.g. onions from two recipes) checks and removes all its
 * items together. Swipe it to the left to delete it, like in iOS Reminders (calm concept 4); a
 * button only screen readers see does the same.
 */
function Item({ row, showSources }: { row: ShoppingRow; showSources?: boolean }) {
  const checked = row.items.every((s) => s.checked)
  const [dx, setDx] = useState(0)
  const [sliding, setSliding] = useState(false)
  const swiped = useRef(false)
  const remove = () => removeWithUndo(row.items, `Am șters ${row.text}`)
  const down = (e: React.PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget, id = e.pointerId
    const x0 = e.clientX, y0 = e.clientY
    let mode: 'wait' | 'swipe' | 'scroll' = 'wait', last = 0
    swiped.current = false
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      const mx = ev.clientX - x0, my = ev.clientY - y0
      if (mode === 'wait') {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { mode = 'scroll'; return }
        if (mx < -10 && Math.abs(mx) > Math.abs(my)) { mode = 'swipe'; swiped.current = true; setSliding(true); try { el.setPointerCapture(id) } catch { /* gone */ } }
        else return
      }
      if (mode !== 'swipe') return
      last = Math.min(0, mx)
      setDx(last)
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setSliding(false)
      if (mode === 'swipe' && last <= -SWIPE_DELETE && ev.type === 'pointerup') { setDx(-window.innerWidth); navigator.vibrate?.(8); setTimeout(remove, 160) }
      else setDx(0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  return (
    <li className={'shop-item' + (dx ? ' moving' : '') + (dx < -SWIPE_DELETE ? ' armed' : '')} onPointerDown={down}
      // A swipe is not a tap: it must not tick the line too.
      onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false } }}>
      <span className="shop-swipe-bg" aria-hidden="true">Șterge</span>
      <label className={checked ? 'done' : ''} style={dx ? { transform: `translateX(${dx}px)` } : undefined} data-sliding={sliding ? '' : undefined}>
        <input type="checkbox" checked={checked} onChange={() => row.items.forEach((s) => shoppingStore.update({ ...s, checked: !checked }))} />
        <span className="shop-text">{row.text}</span>
        {row.sources.length > (showSources ? 0 : 1) && <small className="shop-sources">{row.sources.join(' · ')}</small>}
      </label>
      <button type="button" className="shop-remove sr-only" onClick={remove}>Șterge {row.text}</button>
    </li>
  )
}

/** The family's shopping list: grouped by shop aisle or by recipe, bought items drop into "În coș". Works offline in the shop. */
export default function Shopping() {
  const items = useSyncedList(shoppingStore)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [menu, setMenu] = useState(false)
  const [basketOpen, setBasketOpen] = useState(false)
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }
  const sorted = items.slice().sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const open = sorted.filter((s) => !s.checked)
  const done = sorted.filter((s) => s.checked)

  // The same ingredient from several recipes is one line with the amounts added up ("3 cepe").
  // Groups keep the order in which recipes were added; items typed by hand come first, then
  // the lines shared by several recipes.
  const MANY = 'Pentru mai multe rețete'
  const openRows = mergeShopping(open)
  const groups = new Map<string, ShoppingRow[]>()
  for (const row of openRows) {
    const first = row.items[0]
    const k = row.sources.length > 1 ? MANY : first.recipeId ? first.recipeTitle ?? 'Rețetă' : ''
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  const rank = (k: string) => (k === '' ? 0 : k === MANY ? 1 : 2)
  const ordered = [...groups].sort(([a], [b]) => rank(a) - rank(b))
  const doneRows = mergeShopping(done)
  // By aisle: each merged line under its aisle, in the order of a walk through the shop.
  const byAisle = AISLES.map((a) => ({ aisle: a, rows: openRows.filter((r) => aisleOf(r.text) === a.key) })).filter((g) => g.rows.length)

  // The list as plain text, by aisle, for someone without the app (WhatsApp, Notes, Messages).
  const shareList = async () => {
    const text = ['Cumpărături', ...byAisle.map(({ aisle, rows }) => `\n${aisle.name}\n${rows.map((r) => `• ${r.text}`).join('\n')}`)].join('\n')
    try {
      if (navigator.share) { await navigator.share({ text }); return }
      await navigator.clipboard.writeText(text)
      showToast('Am copiat lista. O poți lipi într-un mesaj.')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      try { await navigator.clipboard.writeText(text); showToast('Am copiat lista. O poți lipi într-un mesaj.') } catch { showToast('Nu am putut trimite lista.') }
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    addShoppingText(text)
    setText('')
  }

  const closeMenu = useCallback(() => { setMenu(false); setConfirming(false); setClearingAll(false) }, [])
  const total = openRows.length + doneRows.length
  return (
    <section className="shopping shop-calm">
      <div className="shop-top">
        <div>
          <h1>Cumpărături</h1>
          {items.length > 0 && <small className="shop-count">{openRows.length} de luat{doneRows.length > 0 && ` · ${doneRows.length} în coș`}</small>}
        </div>
        {/* Sharing and emptying live in ⋯ (calm concept 4). */}
        {items.length > 0 && (
          <span className="menu-anchor shop-more-anchor">
            <button type="button" className="shop-more" aria-label="Opțiuni listă" aria-haspopup="menu" aria-expanded={menu} onClick={() => (menu ? closeMenu() : setMenu(true))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            {menu && (
              <PopMenu label="Opțiuni listă" onClose={closeMenu}>
                {open.length > 0 && <MenuRow icon={MENU_ICON.share} onClick={() => { closeMenu(); shareList() }}>Trimite lista</MenuRow>}
                {done.length > 0 && (confirming ? (
                  <div className="menu-confirm">Golești coșul ({doneRows.length})?
                    <div>
                      <button type="button" className="btn danger small" onClick={() => { removeWithUndo(done, 'Am golit coșul'); closeMenu() }}>Da, golește</button>
                      <button type="button" className="btn small" onClick={() => setConfirming(false)}>Nu</button>
                    </div>
                  </div>
                ) : <MenuRow icon={CART_ICON} onClick={() => { setClearingAll(false); setConfirming(true) }}>Golește coșul</MenuRow>)}
                {clearingAll ? (
                  <div className="menu-confirm">Ștergi toate cele {total} produse?
                    <div>
                      <button type="button" className="btn danger small" onClick={() => { removeWithUndo(items, 'Am golit lista'); closeMenu() }}>Da, golește tot</button>
                      <button type="button" className="btn small" onClick={() => setClearingAll(false)}>Nu</button>
                    </div>
                  </div>
                ) : <MenuRow icon={MENU_ICON.trash} danger onClick={() => { setConfirming(false); setClearingAll(true) }}>Golește toată lista</MenuRow>}
              </PopMenu>
            )}
          </span>
        )}
      </div>

      {open.length > 0 && (
        <div className="seg shop-view" role="group" aria-label="Grupează lista">
          <button type="button" aria-pressed={view === 'aisles'} onClick={() => setView('aisles')}>Pe raioane</button>
          <button type="button" aria-pressed={view === 'recipes'} onClick={() => setView('recipes')}>Pe rețete</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <p>Lista e goală.</p>
          <p>Deschide o rețetă și apasă <b>Pune în listă</b>, sau adaugă tot ce ai planificat în <Link to="/saptamana">Săptămâna mea</Link>.</p>
        </div>
      ) : (
        <>
          {view === 'aisles' ? byAisle.map(({ aisle, rows }) => (
            <section key={aisle.key} className="shop-group shop-aisle">
              <h2>{aisle.name}</h2>
              <ul className="checklist">{rows.map((row) => <Item key={row.key} row={row} showSources />)}</ul>
            </section>
          )) : ordered.map(([title, xs]) => (
            <section key={title || '_'} className="shop-group shop-aisle">
              {title ? <h2>{title}</h2> : groups.size > 1 && <h2>Altele</h2>}
              <ul className="checklist">{xs.map((row) => <Item key={row.key} row={row} />)}</ul>
            </section>
          ))}
          {open.length === 0 && <p className="shop-all-done">Ai luat tot!</p>}
          {done.length > 0 && (
            // Folded; a tap opens it, with "Golește coșul" inside too.
            <section className={'shop-group shop-aisle shop-done' + (basketOpen ? ' open' : '')}>
              <h2>
                <button type="button" className="shop-fold" aria-expanded={basketOpen} onClick={() => setBasketOpen((o) => !o)}>
                  În coș · {doneRows.length}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </h2>
              {basketOpen && <>
                <ul className="checklist">{doneRows.map((row) => <Item key={row.key} row={row} />)}</ul>
                <button type="button" className="shop-empty-basket" onClick={() => removeWithUndo(done, 'Am golit coșul')}>Golește coșul</button>
              </>}
            </section>
          )}
        </>
      )}

      {/* Adding sits at the bottom, where the thumb is; the gold arrow (or the keyboard's Done) adds. */}
      <form className="shop-addbar" onSubmit={add}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <input aria-label="Adaugă în listă" placeholder="Adaugă ceva, ex. 1 l lapte" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
        {text.trim() && (
          <button type="submit" className="shop-addbar-go" aria-label="Adaugă">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </button>
        )}
      </form>
    </section>
  )
}
