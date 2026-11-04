import { useEffect, useState, type FormEvent } from 'react'
import { errorText } from '../lib/errors'
import { inviteFamilyMember, listFamily, type FamilyMember } from '../lib/db'
import { isAdmin, spaceReady } from '../lib/space'
import { useOnline } from '../lib/useOffline'

/** Settings group (admins only): who can sign in and in which space, and inviting someone new by email. */
export default function FamilySection({ me }: { me?: string }) {
  const [admin, setAdmin] = useState(isAdmin)
  useEffect(() => { spaceReady().then(() => setAdmin(isAdmin())) }, [])
  return admin ? <Accounts me={me} /> : null
}

function memberNote(m: FamilyMember, me?: string) {
  if (m.email === me) return 'Tu'
  if (m.pending) return m.sameSpace ? 'Invitat în spațiul tău, încă nu s-a conectat' : 'Invitat cu cont separat, încă nu s-a conectat'
  return m.sameSpace ? 'În spațiul tău: vede tot' : 'Cont separat: vede doar ce partajezi'
}

function Accounts({ me }: { me?: string }) {
  const online = useOnline()
  const [members, setMembers] = useState<FamilyMember[]>()
  const [email, setEmail] = useState('')
  const [separate, setSeparate] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (!online) return
    listFamily().then(setMembers).catch((e) => setMsg({ ok: false, text: errorText(e) }))
  }, [online])

  async function send(address: string, resend: boolean) {
    setBusy(address)
    setMsg(undefined)
    try {
      const m = await inviteFamilyMember(address, resend, separate)
      setMembers((list) => [...(list ?? []).filter((x) => x.email !== m.email), m])
      if (!resend) setEmail('')
      setMsg({ ok: true, text: `Am trimis invitația la ${m.email}. Primește pe email o parolă temporară.` })
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) })
    } finally {
      setBusy(undefined)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (email.trim()) send(email, false)
  }

  return (
    <div className="set-group">
      <h2 className="set-label">Conturi</h2>
      <div className="set-box">
        {!online && <div className="set-row"><span className="muted">Ai nevoie de internet ca să vezi familia.</span></div>}
        {online && !members && !msg && <div className="set-row"><span className="muted">Se încarcă…</span></div>}
        {members?.map((m) => (
          <div className="set-row" key={m.email}>
            <span className="member">
              <span className="member-email">{m.email}</span>
              <small>{memberNote(m, me)}</small>
            </span>
            {m.pending && m.email !== me && (
              <button type="button" className="btn small" disabled={!!busy} onClick={() => send(m.email, true)}>
                {busy === m.email ? 'Se trimite…' : 'Retrimite'}
              </button>
            )}
          </div>
        ))}
        <div className="set-row stack">
          <span id="invite-space-label">Invită ca</span>
          <div className="seg" role="group" aria-labelledby="invite-space-label">
            <button type="button" aria-pressed={separate} onClick={() => setSeparate(true)}>Cont separat</button>
            <button type="button" aria-pressed={!separate} onClick={() => setSeparate(false)}>În spațiul meu</button>
          </div>
        </div>
        <form className="set-row invite-row" onSubmit={onSubmit}>
          <input type="email" inputMode="email" autoComplete="off" placeholder="email@exemplu.ro" aria-label="Email persoană invitată"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={!online} />
          <button type="submit" className="btn small primary" disabled={!online || !email.trim() || !!busy}>
            {busy === email ? 'Se trimite…' : 'Invită'}
          </button>
        </form>
      </div>
      {msg && <p className={msg.ok ? 'set-hint' : 'set-hint error'} role="status">{msg.text}</p>}
      <p className="set-hint">
        {separate
          ? 'Cont separat: are rețetele și poveștile lui și vede doar ce partajezi tu (poveștile sunt partajate de la început, rețetele nu).'
          : 'În spațiul meu: vede și poate modifica toate rețetele și poveștile tale, săptămâna și lista de cumpărături.'}
      </p>
    </div>
  )
}
