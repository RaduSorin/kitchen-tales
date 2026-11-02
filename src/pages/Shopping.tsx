import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSyncedList } from '../lib/synced'
import { addShoppingText, shoppingStore } from '../lib/plan'
import type { ShoppingItem } from '../lib/types'

function Item({ s }: { s: ShoppingItem }) {
  return (
    <li className="shop-item">
      <label className={s.checked ? 'done' : ''}>
        <input type="checkbox" checked={s.checked} onChange={() => shoppingStore.update({ ...s, checked: !s.checked })} />
        <span>{s.text}</span>
      </label>
      <button type="button" className="shop-remove" onClick={() => shoppingStore.remove(s.id)} aria-label={`Șterge ${s.text}`}>
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
  const sorted = items.slice().sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const open = sorted.filter((s) => !s.checked)
  const done = sorted.filter((s) => s.checked)

  // Groups keep the order in which recipes were added; items typed by hand come first.
  const groups = new Map<string, ShoppingItem[]>()
  for (const s of open) {
    const k = s.recipeId ? s.recipeTitle ?? 'Rețetă' : ''
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  const ordered = [...groups].sort(([a], [b]) => (a ? 1 : 0) - (b ? 1 : 0))

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    addShoppingText(text)
    setText('')
  }

  return (
    <section className="shopping">
      <div className="recipes-head">
        <h1>Cumpărături</h1>
        {open.length > 0 && <small className="shop-count">{open.length} de luat</small>}
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
              <ul className="checklist">{xs.map((s) => <Item key={s.id} s={s} />)}</ul>
            </section>
          ))}
          {open.length === 0 && <p className="shop-all-done">Ai luat tot!</p>}
          {done.length > 0 && (
            <section className="shop-group shop-done">
              <div className="section-head">
                <h2>În coș <small className="count">{done.length}</small></h2>
                {confirming ? (
                  <span className="confirm">
                    <button type="button" className="btn danger small" onClick={() => { done.forEach((s) => shoppingStore.remove(s.id)); setConfirming(false) }}>Da, golește</button>
                    <button type="button" className="btn small" onClick={() => setConfirming(false)}>Nu</button>
                  </span>
                ) : (
                  <button type="button" className="btn small" onClick={() => setConfirming(true)}>Golește coșul</button>
                )}
              </div>
              <ul className="checklist">{done.map((s) => <Item key={s.id} s={s} />)}</ul>
            </section>
          )}
        </>
      )}
    </section>
  )
}
