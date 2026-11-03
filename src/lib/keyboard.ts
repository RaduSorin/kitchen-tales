// iOS opens the on-screen keyboard only when a field is focused during the tap itself. A tab that
// navigates to a page with a search box can't focus that box yet (it isn't on screen), so the tap
// focuses an invisible stand-in field; when the real box appears, focus moves to it and iOS keeps
// the keyboard open.
let proxy: HTMLInputElement | undefined
let timer: number | undefined

function dropProxy() {
  clearTimeout(timer)
  proxy?.remove()
  proxy = undefined
}

/** Call from the tap handler. Focuses the field right away if it is already on the page. */
export function primeKeyboard(fieldId: string) {
  const el = document.getElementById(fieldId)
  if (el instanceof HTMLInputElement) { focusField(el); return }
  dropProxy()
  const p = document.createElement('input')
  p.type = 'text'
  p.setAttribute('aria-hidden', 'true')
  p.tabIndex = -1
  // 16px avoids iOS zooming in; kept in view but invisible so the page doesn't jump.
  Object.assign(p.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px', border: '0', padding: '0' })
  document.body.appendChild(p)
  p.focus({ preventScroll: true })
  proxy = p
  // Give up if the real field never shows up (e.g. no stories yet).
  timer = window.setTimeout(() => { proxy?.blur(); dropProxy() }, 5000)
}

/** Moves focus (and the open keyboard) to the field and scrolls it into view. */
export function focusField(el: HTMLElement | null) {
  if (!el) return
  el.focus({ preventScroll: true })
  dropProxy()
  // Wait a moment for the keyboard to resize the viewport, then center the field.
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
}
