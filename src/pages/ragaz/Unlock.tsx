import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Loading } from '../../components/LoadState'
import { cancelled } from '../../lib/mind/passkey'
import { codeOk, loadVault, unlockWithCode, unlockWithFaceId, useVault, keyWithCode, keyWithFaceId, type VaultHeader } from '../../lib/mind/vault'
import { flushPending } from '../../lib/mind/backup'
import '../../ragaz.css'


const FACE = 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16c1.5 1 3.5 1 5 0'

/**
 * The six-or-more-digit backup code field. A text field hidden with CSS (rg-code), not a password
 * field: on a password field iOS ignores the number pad and offers a strong password instead.
 */
export function CodeInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="night-field rg-code">{label}
      <input type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} pattern="[0-9]*" maxLength={12}
        name="ragaz-code" data-1p-ignore data-lpignore="true" value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
    </label>
  )
}

/**
 * Face ID (when the vault has a passkey) or the backup code. `faceId` and `code` do the opening;
 * `code` answers false for a wrong code.
 */
export function UnlockPanel({ hasFaceId, faceId, code, title = 'Răgaz e blocat', note }: {
  hasFaceId: boolean
  faceId: () => Promise<void>
  code: (c: string) => Promise<boolean>
  title?: string
  note?: string
}) {
  const [useCode, setUseCode] = useState(!hasFaceId)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wrong, setWrong] = useState(0)
  const [hint, setHint] = useState(false)

  const face = () => {
    setError('')
    setBusy(true)
    setHint(false)
    // A cancel and a phone without this passkey look the same to the page: offer the code either way.
    faceId().catch((e: Error) => { if (!cancelled(e)) setError(e.message); else setHint(true) }).finally(() => setBusy(false))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!codeOk(value) || busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await code(value)
      if (!ok) {
        setWrong((n) => n + 1)
        setValue('')
        setError(wrong >= 2 ? 'Cod greșit. Codul l-ai ales când ai pornit Răgaz; are cel puțin 6 cifre.' : 'Cod greșit.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rg-unlock">
      <div className="rg-lock-ic" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
      </div>
      <h1>{title}</h1>
      <p>{note ?? 'Ce scrii aici e criptat pe telefon. Deschide-l cu Face ID sau cu codul tău.'}</p>
      {!useCode ? (
        <div className="rg-unlock-actions">
          <button type="button" className="moon-btn rg-wide" disabled={busy} onClick={face}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={FACE} /></svg>
            {busy ? 'Se deschide…' : 'Deschide cu Face ID'}
          </button>
          {hint && <p className="set-hint">Dacă Face ID nu a apărut, pe acest telefon poate lipsi cheia lui. Deschide cu codul, apoi îl pornești din nou din Setări Răgaz.</p>}
          <button type="button" className="link-btn rg-alt" onClick={() => { setUseCode(true); setError('') }}>Folosește codul</button>
        </div>
      ) : (
        <form className="rg-unlock-actions" onSubmit={submit}>
          <CodeInput label="Codul de rezervă" value={value} onChange={setValue} autoFocus />
          <button type="submit" className="moon-btn rg-wide" disabled={busy || !codeOk(value)}>{busy ? 'Se verifică…' : 'Deschide'}</button>
          {hasFaceId && <button type="button" className="link-btn rg-alt" onClick={() => { setUseCode(false); setError('') }}>Folosește Face ID</button>}
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}

/** Unlocks a header that is not this phone's vault yet (restoring a backup): gives the data key. */
export function UnlockHeader({ header, onKey, title, note }: { header: VaultHeader; onKey: (key: CryptoKey) => Promise<void>; title?: string; note?: string }) {
  return (
    <UnlockPanel hasFaceId={!!header.passkey} title={title} note={note}
      faceId={async () => { await onKey(await keyWithFaceId(header)) }}
      code={async (c) => { const key = await keyWithCode(header, c); if (!key) return false; await onKey(key); return true }} />
  )
}

/** Every /ragaz page sits behind this: setup first, then Face ID or the code. */
export function RagazGate() {
  const vault = useVault()
  useEffect(() => { loadVault() }, [])
  useEffect(() => { if (vault.status === 'open') flushPending().catch(() => {}) }, [vault.status])
  if (vault.status === 'loading') return <Loading />
  if (vault.status === 'none') return <Navigate to="/ragaz/incepe" replace />
  if (vault.status === 'locked') {
    return (
      <section className="ragaz">
        <UnlockPanel hasFaceId={!!vault.header.passkey} faceId={unlockWithFaceId} code={unlockWithCode} />
      </section>
    )
  }
  return <Outlet />
}
