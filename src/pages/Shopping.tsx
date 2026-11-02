import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSyncedList } from '../lib/synced'
import { addShoppingText, shoppingStore } from '../lib/plan'
import { mergeShopping, type ShoppingRow } from '../lib/merge'
import type { ShoppingItem } from '../lib/types'
import { showToast } from '../lib/toast'

/** Removes items right away and offers to bring them back for a few seconds. */
function removeWithUndo(items: ShoppingItem[], text: string) {
  items.forEach((s) => shoppingStore.remove(s.id))
  showToast(text, () => items.forEach((s) => shoppingStore.create(s)))
}

/** One line on the list; a merged line (e.g. onions from two recipes) checks and removes all its items together. */
function Item({ row }: { row: ShoppingRow }) {
  const checked = row.items.every((s) => s.checked)
  return (
    <li className="shop-item">
      <label className={checked ? 'done' : ''}>
        <input type="checkbox" checked={checked} onChange={() => row.items.forEach((s) => shoppingStore.update({ ...s, checked: !checked }))} />
        <span>
          {row.text}
          {row.sources.length > 1 && <small className="shop-sources">{row.sources.join(' · ')}</small>}
        </span>
      </label>
      <button type="button" className="shop-remove" onClick={() => removeWithUndo(row.items, `Am șters ${row.text}`)} aria-label={`Șterge ${row.text}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </li>
  )
}

/** The family's shopping list: grouped by recipe, bought items drop into "În coș". Works offline in the shop. */
export default function Shopping() {
  const items = useSyncedList(shoppingStore)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
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

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    addShoppingText(text)
    setText('')
  }

  return (
    <section className="shopping">
      <div className="recipes-head">
        <h1>Cumpărături</h1>
        {open.length > 0 && <small className="shop-count">{openRows.length} de luat</small>}
      </div>

      <form className="shop-add" onSubmit={add}>
        <input aria-label="Adaugă în listă" placeholder="Adaugă ceva, ex. 1 l lapte" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
        <button type="submit" className="btn primary" disabled={!text.trim()}>Adaugă</button>
      </form>

      {items.length === 0 ? (
        <div className="empty">
          <p>Lista e goală.</p>
          <p>Deschide o rețetă și apasă <b>Pune în listă</b>, sau adaugă tot ce ai planificat în <Link to="/saptamana">Săptămâna mea</Link>.</p>
        </div>
      ) : (
        <>
          {ordered.map(([title, xs]) => (
            <section key={title || '_'} className="shop-group">
              {title ? <h2>{title}</h2> : groups.size > 1 && <h2>Altele</h2>}
              <ul className="checklist">{xs.map((row) => <Item key={row.key} row={row} />)}</ul>
            </section>
          ))}
          {open.length === 0 && <p className="shop-all-done">Ai luat tot!</p>}
          {done.length > 0 && (
            <section className="shop-group shop-done">
              <div className="section-head">
                <h2>În coș <small className="count">{doneRows.length}</small></h2>
                {confirming ? (
                  <span className="confirm">
                    <button type="button" className="btn danger small" onClick={() => { removeWithUndo(done, 'Am golit coșul'); setConfirming(false) }}>Da, golește</button>
                    <button type="button" className="btn small" onClick={() => setConfirming(false)}>Nu</button>
                  </span>
                ) : (
                  <button type="button" className="btn small" onClick={() => setConfirming(true)}>Golește coșul</button>
                )}
              </div>
              <ul className="checklist">{doneRows.map((row) => <Item key={row.key} row={row} />)}</ul>
            </section>
          )}
          <div className="shop-clear-all">
            {clearingAll ? (
              <span className="confirm">
                Ștergi toate cele {items.length} produse?
                <button type="button" className="btn danger small" onClick={() => { removeWithUndo(items, 'Am golit lista'); setClearingAll(false) }}>Da, golește tot</button>
                <button type="button" className="btn small" onClick={() => setClearingAll(false)}>Nu</button>
              </span>
            ) : (
              <button type="button" className="btn danger" onClick={() => setClearingAll(true)}>Golește toată lista</button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
