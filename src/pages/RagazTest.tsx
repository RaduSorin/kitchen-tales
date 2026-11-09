import { useEffect, useState } from 'react'
import { createPasskey, environment, hasTestPasskey, resetTest, roundTrip, testSalt, unlock, type Environment } from '../lib/ragaz/prf'

const yesNo = (v: boolean | 'unknown' | undefined) => (v === 'unknown' || v === undefined ? 'nu se știe' : v ? 'da' : 'nu')

/**
 * Răgaz technical test (not linked anywhere): can Face ID unlock an encryption key in the Home
 * Screen app? Open /ragaz/test from the app icon, tap the two buttons, then "Copiază rezultatul".
 */
export default function RagazTest() {
  const [env, setEnv] = useState<Environment>()
  // The salt is ready before any tap: iOS wants the Face ID prompt straight from the tap.
  const [salt, setSalt] = useState<Uint8Array>()
  const [hasKey, setHasKey] = useState(hasTestPasskey)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const add = (line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString('ro-RO')} ${line}`])

  useEffect(() => { environment().then(setEnv); testSalt().then(setSalt) }, [])

  const run = (what: string, fn: () => Promise<void>) => () => {
    setBusy(true)
    fn().catch((e: Error) => add(`${what}: eroare ${e.name}: ${e.message}`)).finally(() => setBusy(false))
  }

  const create = run('Creare', async () => {
    const r = await createPasskey(salt!)
    setHasKey(true)
    add(`Cheie creată. PRF activ: ${yesNo(r.prfEnabled)}. Secret la creare: ${r.secretAtCreate ? 'da' : 'nu'}.`)
  })

  const open = run('Deblocare', async () => {
    const secret = await unlock(salt!)
    if (!secret) { add('Face ID a mers, dar nu a dat niciun secret PRF: deblocarea va cere codul.'); return }
    add(`Face ID a dat un secret PRF de ${secret.byteLength} octeți.`)
    const r = await roundTrip(secret)
    add(r.kind === 'saved'
      ? 'Am criptat un text de probă. Apasă din nou „Deblochează” ca să verificăm că se decriptează.'
      : `Decriptat cu succes: „${r.text}”. PRF funcționează.`)
  })

  const report = () => [
    `Aplicație de pe ecranul principal: ${env?.standalone ? 'da' : 'nu'}`,
    `iOS: ${env?.ios}`,
    `WebAuthn: ${yesNo(env?.webauthn)}; Face ID/Touch ID: ${yesNo(env?.platformAuthenticator)}; PRF raportat: ${yesNo(env?.prfCapability)}`,
    ...log,
  ].join('\n')

  return (
    <section className="settings" style={{ display: 'grid', gap: 16, paddingBottom: 40 }}>
      <h1>Răgaz · test Face ID</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        Deschide pagina din aplicația de pe ecranul principal. Apasă „Creează cheia”, apoi „Deblochează” de două ori.
      </p>
      {env && (
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Aplicație de pe ecranul principal: <b>{env.standalone ? 'da' : 'nu'}</b></li>
          <li>iOS: <b>{env.ios}</b></li>
          <li>Face ID disponibil: <b>{yesNo(env.platformAuthenticator)}</b></li>
          <li>PRF raportat de Safari: <b>{yesNo(env.prfCapability)}</b></li>
        </ul>
      )}
      <button type="button" className="btn primary big" disabled={busy || !salt || !env?.webauthn} onClick={create}>
        1. Creează cheia (Face ID)
      </button>
      <button type="button" className="btn primary big" disabled={busy || !salt || !hasKey} onClick={open}>
        2. Deblochează (Face ID)
      </button>
      {log.length > 0 && (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--surface)', padding: 12, borderRadius: 12 }}>{log.join('\n')}</pre>
      )}
      <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(report()).then(() => add('Rezultatul e copiat.'), () => add('Nu am putut copia.'))}>
        Copiază rezultatul
      </button>
      <button type="button" className="btn ghost" onClick={() => { resetTest(); setHasKey(false); setLog([]) }}>
        Începe din nou
      </button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        Cheia de test apare în Setări › Parole ca „Răgaz (test)” și se poate șterge de acolo.
      </p>
    </section>
  )
}
