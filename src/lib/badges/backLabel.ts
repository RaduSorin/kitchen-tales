// Where the album's or passport's back button leads, said in words, after a new badge was put there.

/** The back button's words for the page the badge was earned on. */
export function backLabelFor(path: string) {
  if (/^\/retete\/[^/]+\/gateste$/.test(path)) return 'Înapoi la gătit'
  if (/^\/retete\/[^/]+(\/editeaza)?$/.test(path) && path !== '/retete/noua') return 'Înapoi la rețetă'
  if (path.startsWith('/retete')) return 'Înapoi la rețete'
  if (path === '/povesti/acasa' || path === '/povesti') return 'Înapoi la povești'
  if (path === '/povesti/adauga') return 'Înapoi la povești'
  if (/^\/povesti\/[^/]+$/.test(path)) return 'Înapoi la poveste'
  if (path === '/') return 'Înapoi acasă'
  if (path.startsWith('/saptamana')) return 'Înapoi la săptămână'
  if (path === '/cumparaturi') return 'Înapoi la listă'
  return 'Înapoi'
}
