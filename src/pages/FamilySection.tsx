import { useEffect, useState, type FormEvent } from 'react'
import { inviteFamilyMember, listFamily, type FamilyMember } from '../lib/db'
import { useOnline } from '../lib/useOffline'

/** Settings group: who can sign in, and inviting someone new by email. */
export default function FamilySection({ me }: { me?: string }) {
  const online = useOnline()
  const [members, setMembers] = useState<FamilyMember[]>()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (!online) return
    listFamily().then(setMembers).catch((e) => setMsg({ ok: false, text: (e as Error).message }))
  }, [online])

  async function send(address: string, resend: boolean) {
    setBusy(address)
    setMsg(undefined)
    try {
      const m = await inviteFamilyMember(address, resend)
      setMembers((list) => [...(list ?? []).filter((x) => x.email !== m.email), m])
      if (!resend) setEmail('')
      setMsg({ ok: true, text: `Am trimis invitația la ${m.email}. Primește pe email o parolă temporară.` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
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
      <h2 className="set-label">Familia</h2>
      <div className="set-box">
        {!online && <div className="set-row"><span className="muted">Ai nevoie de internet ca să vezi familia.</span></div>}
        {online && !members && !msg && <div className="set-row"><span className="muted">Se încarcă…</span></div>}
        {members?.map((m) => (
          <div className="set-row" key={m.email}>
            <span className="member">
              <span className="member-email">{m.email}</span>
              <small>{m.email === me ? 'Tu' : m.pending ? 'Invitat, încă nu s-a conectat' : 'Are cont'}</small>
            </span>
            {m.pending && m.email !== me && (
              <button type="button" className="btn small" disabled={!!busy} onClick={() => send(m.email, true)}>
                {busy === m.email ? 'Se trimite…' : 'Retrimite'}
              </button>
            )}
          </div>
        ))}
        <form className="set-row invite-row" onSubmit={onSubmit}>
          <input type="email" inputMode="email" autoComplete="off" placeholder="email@exemplu.ro" aria-label="Email persoană invitată"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={!online} />
          <button type="submit" className="btn small primary" disabled={!online || !email.trim() || !!busy}>
            {busy === email ? 'Se trimite…' : 'Invită'}
          </button>
        </form>
      </div>
      {msg && <p className={msg.ok ? 'set-hint' : 'set-hint error'} role="status">{msg.text}</p>}
      <p className="set-hint">Cine primește invitația vede și poate modifica toate rețetele și poveștile.</p>
    </div>
  )
}
