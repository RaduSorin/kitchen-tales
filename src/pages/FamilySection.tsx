import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorText } from '../lib/errors'
import { inviteFamilyMember, listFamily, type FamilyMember } from '../lib/db'
import { isAdmin, spaceReady } from '../lib/space'
import { useOnline } from '../lib/useOffline'

/** Whether this account manages the accounts (Sorin): only admins see People and invitations. */
export function useIsAdmin() {
  const [admin, setAdmin] = useState(isAdmin)
  useEffect(() => { spaceReady().then(() => setAdmin(isAdmin())) }, [])
  return admin
}

/** The accounts, once per app start (the Profile page shows the count, People the list). */
let cached: FamilyMember[] | undefined
export function useFamily() {
  const online = useOnline()
  const admin = useIsAdmin()
  const [members, setMembers] = useState(cached)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!online || !admin) return
    listFamily().then((m) => { cached = m; setMembers(m) }).catch((e) => setError(errorText(e)))
  }, [online, admin])
  return { members, error, online, admin }
}

function memberNote(m: FamilyMember, me?: string) {
  if (m.email === me) return 'Tu · administrator'
  if (m.pending) return 'Invitat, încă nu s-a conectat'
  return m.sameSpace ? 'Vede și modifică tot' : 'Vede doar ce partajezi'
}

/** People: who is in our space, who has a separate account, and resending a pending invitation. */
export function Members({ me }: { me?: string }) {
  const { members, error, online } = useFamily()
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  async function resend(m: FamilyMember) {
    setBusy(m.email); setMsg(undefined)
    try {
      await inviteFamilyMember(m.email, true, !m.sameSpace)
      setMsg({ ok: true, text: `Am retrimis invitația la ${m.email}.` })
    } catch (e) { setMsg({ ok: false, text: errorText(e) }) }
    setBusy(undefined)
  }

  const group = (title: string, items: FamilyMember[], hint: string) => !!items.length && (
    <div className="set-group">
      <h2 className="set-label">{title}</h2>
      <div className="set-box">
        {items.map((m) => (
          <div className="set-row prof-row" key={m.email}>
            <span className="avatar" style={{ width: 34, height: 34, fontSize: 15 }} aria-hidden="true">{m.email.charAt(0).toUpperCase()}</span>
            <span className="prof-l member"><span className="member-email">{m.email}</span><small>{memberNote(m, me)}</small></span>
            {m.pending && m.email !== me && (
              <button type="button" className="btn small" disabled={!!busy} onClick={() => resend(m)}>{busy === m.email ? 'Se trimite…' : 'Retrimite'}</button>
            )}
          </div>
        ))}
      </div>
      <p className="set-hint">{hint}</p>
    </div>
  )

  if (!online) return <p className="set-hint">Ai nevoie de internet ca să vezi conturile.</p>
  if (error) return <p className="set-hint error">{error}</p>
  if (!members) return <p className="set-hint">Se încarcă…</p>
  return (
    <>
      {group('Spațiul tău', members.filter((m) => m.sameSpace || m.email === me), 'Cei din spațiul tău văd și modifică toate rețetele, poveștile, săptămâna și lista de cumpărături.')}
      {group('Conturi separate', members.filter((m) => !m.sameSpace && m.email !== me), 'Au rețetele și poveștile lor și văd doar ce partajezi tu.')}
      {msg && <p className={msg.ok ? 'set-hint' : 'set-hint error'} role="status">{msg.text}</p>}
      <Link to="/profil/invita" className="btn primary prof-cta">Invită pe cineva</Link>
    </>
  )
}

/** Inviting someone by email, into our space or with a separate account. */
export function InviteForm() {
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [separate, setSeparate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true); setMsg(undefined)
    try {
      const m = await inviteFamilyMember(email, false, separate)
      cached = [...(cached ?? []).filter((x) => x.email !== m.email), m]
      setEmail('')
      setMsg({ ok: true, text: `Am trimis invitația la ${m.email}. Primește pe email o parolă temporară.` })
    } catch (err) { setMsg({ ok: false, text: errorText(err) }) }
    setBusy(false)
  }

  return (
    <div className="set-group">
      <div className="set-box">
        <form className="set-row invite-row" onSubmit={onSubmit}>
          <input type="email" inputMode="email" autoComplete="off" placeholder="email@exemplu.ro" aria-label="Email persoană invitată"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={!online} />
          <button type="submit" className="btn small primary" disabled={!online || !email.trim() || busy}>{busy ? 'Se trimite…' : 'Invită'}</button>
        </form>
        <div className="set-row stack">
          <span id="invite-space-label">Ce vede</span>
          <div className="seg" role="group" aria-labelledby="invite-space-label">
            <button type="button" aria-pressed={separate} onClick={() => setSeparate(true)}>Cont separat</button>
            <button type="button" aria-pressed={!separate} onClick={() => setSeparate(false)}>În spațiul meu</button>
          </div>
        </div>
      </div>
      {!online && <p className="set-hint error">Ai nevoie de internet ca să trimiți o invitație.</p>}
      {msg && <p className={msg.ok ? 'set-hint' : 'set-hint error'} role="status">{msg.text}</p>}
      <p className="set-hint">
        {separate
          ? 'Cont separat: are rețetele și poveștile lui și vede doar ce partajezi tu (poveștile sunt partajate de la început, rețetele nu).'
          : 'În spațiul meu: vede și poate modifica toate rețetele și poveștile tale, săptămâna și lista de cumpărături.'}
      </p>
    </div>
  )
}
