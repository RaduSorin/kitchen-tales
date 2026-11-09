import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useBack } from '../../lib/back'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { myEmail } from '../../lib/space'
import { cancelled, createPasskey, passkeysAvailable, type PasskeyRef } from '../../lib/mind/passkey'
import { codeOk, createVault, loadVault, MIN_CODE, useVault } from '../../lib/mind/vault'
import { cloudBackupInfo, downloadCloudBackup, restoreBackup, type Backup } from '../../lib/mind/backup'
import { CodeInput, UnlockHeader } from './Unlock'
import '../../ragaz.css'

type Step = 'about' | 'protect'
const STEPS: Step[] = ['about', 'protect']
const NEXT: Record<Step, string> = { about: 'protecția', protect: '' }

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>

/** Răgaz already set up on another phone: bring that back, or start over. */
function RestoreCard({ savedAt, onFresh }: { savedAt?: string; onFresh: () => void }) {
  const nav = useNavigate()
  const [backup, setBackup] = useState<Backup>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmFresh, setConfirmFresh] = useState(false)
  const fetchIt = () => {
    setBusy(true)
    setError('')
    downloadCloudBackup().then(setBackup, (e: Error) => setError(e.message)).finally(() => setBusy(false))
  }
  if (backup) {
    return (
      <UnlockHeader header={backup.header} title="Deschide copia"
        note="Copia e criptată. Deschide-o cu Face ID (passkey-ul vine prin iCloud) sau cu codul de rezervă."
        onKey={async (key) => { await restoreBackup(backup, key); showToast('Răgaz e înapoi pe acest telefon.'); nav('/ragaz', { replace: true }) }} />
    )
  }
  return (
    <>
      <div className="cs-body">
        <div className="cs-q">
          <span className="cs-kicker">Răgaz</span>
          <h1>Ai deja Răgaz</h1>
          <p>L-ai pornit pe alt telefon{savedAt ? `; ultima copie e din ${fmtDate(savedAt)}` : ''}. Îl poți aduce aici, cu tot ce ai scris.</p>
        </div>
        {confirmFresh && (
          <div className="rg-warn" role="alert">
            Dacă începi din nou, copia veche din cloud va fi înlocuită la prima salvare. Ce ai scris pe celălalt telefon rămâne doar acolo.
            <div className="rg-row-btns">
              <button type="button" className="btn danger small" onClick={onFresh}>Da, încep din nou</button>
              <button type="button" className="btn small" onClick={() => setConfirmFresh(false)}>Nu</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="cs-foot">
        <button type="button" className="moon-btn" disabled={busy} onClick={fetchIt}>{busy ? 'Se descarcă…' : 'Adu-l pe acest telefon'}</button>
        {!confirmFresh && <button type="button" className="link-btn cs-own" onClick={() => setConfirmFresh(true)}>Începe din nou</button>}
      </div>
    </>
  )
}

/** /ragaz/incepe: turning Răgaz on, in cards like "Poveste nouă". */
export default function RagazSetup() {
  const vault = useVault()
  const nav = useNavigate()
  const leave = useBack('/profil/ragaz')
  const [cloud, setCloud] = useState<{ exists: boolean; updatedAt?: string } | null>()
  const [fresh, setFresh] = useState(false)
  const [at, setAt] = useState(0)
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [faceIdPossible, setFaceIdPossible] = useState<boolean>()
  const [passkey, setPasskey] = useState<{ ref: PasskeyRef; secret: ArrayBuffer }>()
  const [faceNote, setFaceNote] = useState('')
  const [backup, setBackup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadVault()
    passkeysAvailable().then(setFaceIdPossible)
    // No cloud answer (offline): set up as new; the restore offer comes back next time.
    cloudBackupInfo().then(setCloud, () => setCloud(null))
  }, [])

  if (vault.status === 'loading' || cloud === undefined) return <Loading />
  if (vault.status !== 'none') return <Navigate to="/ragaz" replace />

  const restoring = !!cloud?.exists && !fresh
  const step = STEPS[at]
  const back = () => { setError(''); if (at > 0 && !restoring) setAt(at - 1); else leave() }

  const faceId = () => {
    setFaceNote('')
    setError('')
    createPasskey(myEmail() ?? 'Răgaz').then(({ ref, secret }) => {
      if (secret) setPasskey({ ref, secret })
      else setFaceNote('Telefonul a creat cheia, dar nu o poate folosi pentru criptare (cere iOS 18 sau mai nou). Răgaz se va deschide cu codul.')
    }, (e: Error) => { if (!cancelled(e)) setFaceNote(`Face ID nu a mers: ${e.message}`) })
  }

  const finish = async () => {
    if (!codeOk(code) || code !== again) return
    setBusy(true)
    setError('')
    try {
      await createVault(code, passkey, { backup })
      showToast('Răgaz e pornit.')
      nav('/ragaz', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const mismatch = again.length >= code.length && !!again && again !== code
  return (
    <section className="ragaz">
      <div className="parent create-steps">
        <div className="cs-top">
          <button type="button" className="night-btn" aria-label={at > 0 && !restoring ? 'Pasul anterior' : 'Înapoi'} onClick={back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          {!restoring && (
            <div className="cs-dots" role="img" aria-label={`Pasul ${at + 1} din ${STEPS.length}`}>
              {STEPS.map((x, i) => <span key={x} className={i === at ? 'on' : i < at ? 'done' : undefined} />)}
            </div>
          )}
          <span />
        </div>

        {restoring ? <RestoreCard savedAt={cloud?.updatedAt} onFresh={() => setFresh(true)} /> : step === 'about' ? (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Răgaz</span>
              <h1>Un loc doar al tău</h1>
              <p>Intenția lunii, câte un exercițiu vinerea și un jurnal în care scrii ce simți. Câteva minute pe săptămână, fără puncte și fără serii de zile.</p>
            </div>
            <ul className="rg-facts">
              <li><b>Ce scrii rămâne pe acest telefon,</b> criptat. Nici serverul, nici familia nu îl pot citi.</li>
              <li><b>Copia din cloud e criptată</b> înainte să plece de pe telefon, ca să nu pierzi nimic dacă schimbi telefonul.</li>
              <li><b>Claude vede ceva doar când apeși tu</b> un buton care îl cheamă.</li>
            </ul>
            <div className="rg-warn">
              Răgaz se deschide cu Face ID sau cu un cod ales de tine. Dacă uiți codul și pierzi și Face ID-ul (de exemplu, telefon nou fără iCloud), datele nu se mai pot deschide. Nici noi nu le putem recupera.
            </div>
          </div>
        ) : (
          <div className="cs-body">
            <div className="cs-q">
              <span className="cs-kicker">Răgaz · protecție</span>
              <h1>Cum îl deschizi</h1>
              <p>Alege un cod de cel puțin {MIN_CODE} cifre. Îl folosești când Face ID nu merge sau pe un telefon nou.</p>
            </div>
            <CodeInput label="Codul de rezervă" value={code} onChange={setCode} />
            <CodeInput label="Scrie-l din nou" value={again} onChange={setAgain} />
            {mismatch && <p className="error">Codurile nu se potrivesc.</p>}
            {faceIdPossible && (
              <div className="rg-card">
                <div>
                  <b>Face ID</b>
                  <small>{passkey ? 'Pornit. Răgaz se deschide cu fața ta.' : 'Deschide Răgaz fără cod. Cheia se salvează în Parole, ca „Răgaz”.'}</small>
                </div>
                {passkey
                  ? <span className="rg-chip">Pornit</span>
                  : <button type="button" className="btn small" onClick={faceId}>Pornește</button>}
              </div>
            )}
            {faceNote && <p className="set-hint">{faceNote}</p>}
            <label className="rg-card">
              <div>
                <b>Copie criptată în cloud</b>
                <small>După fiecare schimbare. Fără ea, ce scrii e doar pe acest telefon.</small>
              </div>
              <input type="checkbox" className="switch" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
            </label>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {!restoring && (
          <div className="cs-foot">
            {step === 'protect' ? (
              <button type="button" className="moon-btn" disabled={busy || !codeOk(code) || code !== again} onClick={finish}>{busy ? 'Se pornește…' : 'Pornește Răgaz'}</button>
            ) : (
              <button type="button" className="moon-btn" onClick={() => setAt(at + 1)}>Mai departe <Arrow /></button>
            )}
            {NEXT[step] && <small className="cs-next">Urmează: {NEXT[step]}</small>}
            {step === 'protect' && !passkey && faceIdPossible && <small className="cs-next">Poți porni Face ID și mai târziu, din Profil › Răgaz.</small>}
          </div>
        )}
      </div>
    </section>
  )
}
