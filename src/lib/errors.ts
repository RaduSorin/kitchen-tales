/**
 * An error as a short Romanian sentence for the screen. The app's own functions already
 * answer in Romanian; network failures and raw server or library messages ("Network error",
 * "Invalid URL") are put in plain words instead of being shown as they are.
 */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const name = err instanceof Error ? err.name : ''
  if (!navigator.onLine) return 'Ești offline. Încearcă din nou când ai internet.'
  // Already written for people (Romanian text from our functions): keep it.
  if (/[ăâîșțĂÂÎȘȚ]/.test(msg)) return msg
  if (/network|failed to fetch|load failed|timed? ?out/i.test(`${name} ${msg}`)) return 'Nu am putut ajunge la server. Verifică internetul și încearcă din nou.'
  if (/\burl\b/i.test(msg)) return 'Linkul nu pare bun. Verifică-l și încearcă din nou.'
  if (/not authori[sz]ed|unauthori[sz]ed/i.test(msg)) return 'E de la alt cont: o poți vedea, dar nu o poți modifica.'
  if (/throttl|rate exceeded|too many/i.test(msg)) return 'Serviciul e ocupat acum. Încearcă din nou peste un minut.'
  return 'A apărut o problemă. Încearcă din nou.'
}
