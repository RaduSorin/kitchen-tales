import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { myEmail } from '../../lib/space'
import { cancelled, createPasskey, passkeysAvailable } from '../../lib/mind/passkey'
import {
  changeCode, codeOk, deleteVault, getLocal, loadVault, lockVault, setLocal, setPasskey, unlockWithCode, unlockWithFaceId, useVault, type VaultLocal,
} from '../../lib/mind/vault'
import { backupNow, cloudBackupInfo, deleteCloudBackup, exportBackup, parseBackup, restoreBackup, type Backup } from '../../lib/mind/backup'
import { CodeInput, UnlockHeader, UnlockPanel } from './Unlock'
import '../../ragaz.css'

const when = (ms?: number) => {
  if (!ms) return 'încă niciuna'
  const d = new Date(ms)
  const today = new Date().toDateString() === d.toDateString()
  return today ? `azi, ${d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })
}

/** Restore from an exported file: pick it, then open it with Face ID or its code. */
function FileRestore() {
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<Backup>()
  const [error, setError] = useState('')
  const pick = async (f?: File) => {
    setError('')
    if (!f) return
    try { setBackup(parseBackup(await f.text())) } catch (e) { setError((e as Error).message) }
  }
  if (backup) {
    return (
      <UnlockHeader header={backup.header} title="Deschide copia"
        note={`Copia din ${new Date(backup.savedAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}. Deschide-o cu Face ID sau cu codul ei.`}
        onKey={async (key) => { await restoreBackup(backup, key); showToast('Răgaz e înapoi pe acest telefon.'); nav('/ragaz') }} />
    )
  }
  return (
    <>
      <button type="button" className="btn" onClick={() => input.current?.click()}>Restaurează dintr-un fișier</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

/** Not set up on this phone: what Răgaz is, and how to start (or bring it back). */
function NotStarted() {
  const [cloud, setCloud] = useState<{ exists: boolean; updatedAt?: string }>()
  useEffect(() => { cloudBackupInfo().then(setCloud, () => {}) }, [])
  return (
    <div className="set-group">
      <p className="rg-intro">
        Un loc doar al tău pentru intenția lunii, câte un exercițiu vinerea și un jurnal. Ce scrii rămâne pe acest telefon, criptat; serverul păstrează cel mult o copie criptată pe care nu o poate citi.
      </p>
      {cloud?.exists && <p className="set-hint">Răgaz e pornit pe alt telefon. Când îl pornești aici, îl poți aduce cu tot ce ai scris.</p>}
      <div className="rg-row-btns">
        <Link to="/ragaz/incepe" className="moon-btn rg-wide">{cloud?.exists ? 'Pornește pe acest telefon' : 'Pornește Răgaz'}</Link>
      </div>
      <FileRestore />
    </div>
  )
}

function ChangeCode({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!codeOk(code) || code !== again) return
    setBusy(true)
    try { await changeCode(code); showToast('Codul e schimbat.'); onDone() } catch (err) { showToast((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="rg-form" onSubmit={submit}>
      <CodeInput label="Codul nou" value={code} onChange={setCode} autoFocus />
      <CodeInput label="Scrie-l din nou" value={again} onChange={setAgain} />
      {again.length >= code.length && !!again && again !== code && <p className="error">Codurile nu se potrivesc.</p>}
      <div className="rg-row-btns">
        <button type="submit" className="btn primary small" disabled={busy || !codeOk(code) || code !== again}>{busy ? 'Se salvează…' : 'Salvează codul'}</button>
        <button type="button" className="btn small" onClick={onDone}>Renunță</button>
      </div>
    </form>
  )
}

/** /profil/ragaz: Face ID, code, the encrypted copy, export, and turning Răgaz off. */
export default function RagazSettings() {
  const vault = useVault()
  const nav = useNavigate()
  const [local, setLocalState] = useState<VaultLocal>()
  const [faceIdPossible, setFaceIdPossible] = useState(false)
  const [editCode, setEditCode] = useState(false)
  const [busy, setBusy] = useState('')
  const [stop, setStop] = useState<'ask' | 'delete'>()

  useEffect(() => { loadVault(); passkeysAvailable().then(setFaceIdPossible) }, [])
  useEffect(() => { if (vault.status === 'open') getLocal().then(setLocalState).catch(() => {}) }, [vault])

  if (vault.status === 'loading') return <Loading />
  if (vault.status === 'none') return <NotStarted />
  if (vault.status === 'locked') {
    return <UnlockPanel hasFaceId={!!vault.header.passkey} faceId={unlockWithFaceId} code={unlockWithCode} title="Deschide Răgaz" note="Setările Răgaz cer Face ID sau codul." />
  }

  const run = (what: string, fn: () => Promise<void>, done?: string) => {
    setBusy(what)
    fn().then(() => { if (done) showToast(done) }, (e: Error) => { if (!cancelled(e)) showToast(e.message) })
      .finally(() => { setBusy(''); getLocal().then(setLocalState).catch(() => {}) })
  }
  const faceOn = !!vault.header.passkey
  const addFaceId = () => run('face', async () => {
    const { ref, secret } = await createPasskey(myEmail() ?? 'Răgaz')
    if (!secret) throw new Error('Telefonul nu poate folosi Face ID pentru criptare (cere iOS 18 sau mai nou). Rămâne codul.')
    await setPasskey({ ref, secret })
  }, 'Face ID e pornit pentru Răgaz.')
  const toggleBackup = (on: boolean) => run('backup', async () => {
    await setLocal({ backup: on, pending: on })
    if (on) await backupNow()
  }, on ? 'Copia criptată e pornită.' : 'Copia din cloud e oprită. Ce scrii rămâne doar pe acest telefon.')
  const turnOff = (removeCloud: boolean) => run('stop', async () => {
    if (removeCloud) await deleteCloudBackup()
    else await backupNow()
    await deleteVault()
    nav('/profil')
  }, removeCloud ? 'Răgaz e oprit și datele sunt șterse.' : 'Răgaz e oprit pe acest telefon. Copia criptată rămâne în cloud.')

  return (
    <>
      <Link to="/ragaz" className="moon-btn rg-wide">Deschide Răgaz</Link>

      <div className="set-group">
        <h2 className="set-label">Deschidere</h2>
        <div className="set-box">
          <div className="set-row">
            <span>Face ID<small className="set-sub">{faceOn ? 'Răgaz se deschide cu fața ta' : faceIdPossible ? 'Oprit: Răgaz se deschide cu codul' : 'Indisponibil pe acest telefon'}</small></span>
            {faceOn
              ? <span className="set-value">Pornit</span>
              : faceIdPossible && <button type="button" className="btn small" disabled={!!busy} onClick={addFaceId}>{busy === 'face' ? '…' : 'Pornește'}</button>}
          </div>
          <div className="set-row">
            {editCode ? <ChangeCode onDone={() => setEditCode(false)} /> : <>
              <span>Codul de rezervă<small className="set-sub">Pentru telefon nou sau când Face ID nu merge</small></span>
              <button type="button" className="btn small" onClick={() => setEditCode(true)}>Schimbă</button>
            </>}
          </div>
          <div className="set-row">
            <span>Blochează acum<small className="set-sub">Se blochează singur după 5 minute fără atingere</small></span>
            <button type="button" className="btn small" onClick={() => { lockVault(); nav('/profil') }}>Blochează</button>
          </div>
        </div>
      </div>

      <div className="set-group">
        <h2 className="set-label">Copii de siguranță</h2>
        <div className="set-box">
          <label className="set-row">
            <span>Copie criptată în cloud<small className="set-sub">{local?.backup ? `Ultima: ${when(local.backupAt)}${local.pending ? ' · o schimbare așteaptă' : ''}` : 'Oprită'}</small></span>
            <input type="checkbox" className="switch" checked={!!local?.backup} disabled={!local || !!busy} onChange={(e) => toggleBackup(e.target.checked)} />
          </label>
          {local?.backup && (
            <div className="set-row">
              <span>Trimite copia acum</span>
              <button type="button" className="btn small" disabled={!!busy} onClick={() => run('now', backupNow, 'Copia e în cloud.')}>{busy === 'now' ? '…' : 'Trimite'}</button>
            </div>
          )}
          <div className="set-row">
            <span>Exportă un fișier<small className="set-sub">Criptat; îl poți păstra în iCloud Drive</small></span>
            <button type="button" className="btn small" disabled={!!busy} onClick={() => run('export', exportBackup)}>Exportă</button>
          </div>
        </div>
        <p className="set-hint">Copia și fișierul sunt criptate pe telefon. Se deschid doar cu Face ID-ul tău sau cu codul de rezervă.</p>
      </div>

      <div className="set-group">
        <div className="set-box">
          <div className="set-row">
            {!stop ? (
              <button type="button" className="btn danger small" onClick={() => setStop('ask')}>Oprește Răgaz</button>
            ) : stop === 'ask' ? (
              <span className="confirm rg-stop">Ce facem cu ce ai scris?
                <button type="button" className="btn small" disabled={!!busy} onClick={() => turnOff(false)}>Păstrează copia în cloud</button>
                <button type="button" className="btn danger small" disabled={!!busy} onClick={() => setStop('delete')}>Șterge tot</button>
                <button type="button" className="btn small" onClick={() => setStop(undefined)}>Renunță</button>
              </span>
            ) : (
              <span className="confirm rg-stop">Ștergi tot ce ai scris în Răgaz, de pe telefon și din cloud? Nu se mai poate recupera.
                <button type="button" className="btn danger small" disabled={!!busy} onClick={() => turnOff(true)}>Da, șterge tot</button>
                <button type="button" className="btn small" onClick={() => setStop(undefined)}>Nu</button>
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
