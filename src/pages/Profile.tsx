import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CITIES, cityByName, sunTimes } from '../lib/sun'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { childAge, updateSettings, useSettings, type ThemeChoice } from '../lib/settings'
import { PRESET_TOOLS } from '../lib/kitchenTools'
import { onOfflineChange, removeAllAudio, savedAudioSummary } from '../lib/offline'
import { listFolders, listStories } from '../lib/db'
import { groupFolders } from '../lib/stories'
import { startKid } from '../lib/kidMode'
import { CheckPinSheet, NewPinSheet } from '../components/KidMode'
import Sheet from '../components/Sheet'
import Avatar from '../components/Avatar'
import { Members, InviteForm, useFamily } from './FamilySection'
import { listRecipes, setFolderShared, setRecipeShared } from '../lib/db'
import { saveMyName, useMyName } from '../lib/me'
import { myEmail, mySpaceName } from '../lib/space'
import type { Recipe } from '../lib/types'
import type { Folder } from '../lib/stories'
import type { ComponentType, FormEvent } from 'react'

const THEMES: [ThemeChoice, string][] = [['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']]
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 15 }, (_, i) => THIS_YEAR - i)

function KitchenTools() {
  const { kitchenTools } = useSettings()
  const [custom, setCustom] = useState('')
  const has = (t: string) => kitchenTools.some((x) => x.toLowerCase() === t.toLowerCase())
  const toggle = (t: string) => updateSettings({
    kitchenTools: has(t) ? kitchenTools.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...kitchenTools, t],
  })
  const add = () => {
    const t = custom.trim()
    if (t && !has(t)) updateSettings({ kitchenTools: [...kitchenTools, t] })
    setCustom('')
  }
  const extra = kitchenTools.filter((t) => !PRESET_TOOLS.some((p) => p.toLowerCase() === t.toLowerCase()))

  return (
    <div className="set-group">
      <div className="set-box">
        <div className="set-row stack">
          <span id="tools-label">Aparate pe care le am</span>
          <div className="tool-chips" role="group" aria-labelledby="tools-label">
            {[...PRESET_TOOLS, ...extra].map((t) => (
              <button type="button" key={t} className={`chip${has(t) ? ' on' : ''}`} aria-pressed={has(t)} onClick={() => toggle(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="set-row">
          <input type="text" className="tool-add" value={custom} placeholder="Alt aparat…" aria-label="Alt aparat" autoComplete="off"
            onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="btn small" onClick={add} disabled={!custom.trim()}>Adaugă</button>
        </div>
      </div>
      <p className="set-hint">Când generezi o rețetă, folosim doar aceste aparate, plus aragazul și cuptorul. Se salvează în cont, la fel pe toate dispozitivele familiei.</p>
    </div>
  )
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const fmtSize = (bytes: number) => (bytes < 1e9 ? `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1e6))} MB` : `${(bytes / 1e9).toFixed(1)} GB`)

/** Stories saved for listening without internet: how much space they take and whether the browser keeps them. */
function OfflineStorage() {
  const [saved, setSaved] = useState<{ count: number; bytes: number }>()
  const [persisted, setPersisted] = useState<boolean | null>(null) // null: the browser cannot tell
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => {
    const load = () => savedAudioSummary().then(setSaved).catch(() => {})
    load()
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    return onOfflineChange(load)
  }, [])
  const protect = async () => {
    const ok = await navigator.storage?.persist?.().catch(() => false)
    setPersisted(!!ok)
  }
  const iosBrowser = isIos() && !isInstalled()
  const canPersist = !!navigator.storage?.persist

  return (
    <div className="set-group">
      <div className="set-box">
        <div className="set-row">
          <span>Povești salvate pe acest dispozitiv</span>
          <span className="set-value">{saved ? `${saved.count} · ${fmtSize(saved.bytes)}` : '…'}</span>
        </div>
        {canPersist && (
          <div className="set-row">
            <span>Protejate de ștergere<small className="set-sub">Telefonul nu le șterge când rămâne fără spațiu</small></span>
            {persisted
              ? <span className="set-value">Da</span>
              : <button type="button" className="btn small" onClick={protect}>Protejează</button>}
          </div>
        )}
        {!!saved?.count && (
          <div className="set-row">
            {confirmClear ? (
              <span className="confirm">Ștergi toate poveștile salvate?
                <button type="button" className="btn danger small" onClick={async () => { await removeAllAudio().catch(() => {}); setConfirmClear(false) }}>Da, șterge</button>
                <button type="button" className="btn small" onClick={() => setConfirmClear(false)}>Nu</button>
              </span>
            ) : <button type="button" className="btn danger small" onClick={() => setConfirmClear(true)}>Șterge toate de pe dispozitiv</button>}
          </div>
        )}
      </div>
      <p className="set-hint">
        {iosBrowser
          ? 'Pe iPhone, poveștile salvate din Safari se șterg după 7 zile fără folosire și nu apar în aplicația de pe ecranul principal. Deschide aplicația de pe ecranul principal și salvează-le de acolo.'
          : 'Poveștile salvate merg și fără internet. Poveștile tale rămân pe server; aici se șterge doar copia de pe acest dispozitiv.'}
      </p>
    </div>
  )
}


function SkySettings() {
  const { city } = useSettings()
  const { lat, lon } = cityByName(city)
  const [today] = useState(() => new Date())
  const { rise, set } = sunTimes(today, lat, lon)
  const hm = (d: Date) => d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="set-group">
      <div className="set-box">
        <label className="set-row">
          <span>Orașul<small className="set-sub">Răsărit {hm(rise)} · apus {hm(set)}</small></span>
          <select id="sky-city" value={cityByName(city).name} onChange={(e) => updateSettings({ city: e.target.value })}>
            {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <p className="set-hint">Cerul se schimbă ca afară: zi cu soare de la răsărit, apus cu o oră înainte și o oră după apusul soarelui, apoi noapte cu stele.</p>
    </div>
  )
}

const KID_TIMES: [number, string][] = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 oră'], [0, 'Fără limită']]
export const Chevron = () => <svg className="set-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>

/** Kid mode: the PIN, the time limit, which folders the child sees, and the button that starts it. */
function KidSettings() {
  const { kid, child } = useSettings()
  const nav = useNavigate()
  const [sheet, setSheet] = useState<'new' | 'check' | 'folders'>()
  const [folders, setFolders] = useState<string[]>([])
  useEffect(() => {
    Promise.all([listStories(), listFolders()]).then(([s, rows]) => setFolders(groupFolders(s, rows).map((f) => f.name))).catch(() => {})
  }, [])
  const allowed = kid.folders.filter((f) => folders.includes(f))
  const toggleFolder = (name: string) => updateSettings({
    kid: { folders: kid.folders.includes(name) ? kid.folders.filter((f) => f !== name) : [...kid.folders, name] },
  })
  const start = () => { startKid(kid.minutes); nav('/povesti/acasa') }

  return (
    <div className="set-group">
      <h2 className="set-label">Modul copil</h2>
      <div className="set-box">
        {!kid.pinHash ? (
          <div className="set-row stack">
            <span>Dă-i telefonul copilului: doar povești, fără ștergere sau mutare, cu timp limitat.<small className="set-sub">Ieși cu un PIN pe care îl alegi acum.</small></span>
            <button type="button" className="btn primary" onClick={() => setSheet('new')}>Alege un PIN</button>
          </div>
        ) : (
          <>
            <label className="set-row">
              <span>Timp</span>
              <select id="kid-time" value={kid.minutes} onChange={(e) => updateSettings({ kid: { minutes: +e.target.value } })}>
                {KID_TIMES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            </label>
            {folders.length > 1 && (
              <button type="button" className="set-row set-link" onClick={() => setSheet('folders')}>
                <span>Foldere</span>
                <span className="set-value">{allowed.length ? (allowed.length === 1 ? allowed[0] : `${allowed.length} din ${folders.length}`) : 'Toate'}<Chevron /></span>
              </button>
            )}
            <button type="button" className="set-row set-link" onClick={() => setSheet('check')}>
              <span>Schimbă PIN-ul</span>
              <span className="set-value">••••<Chevron /></span>
            </button>
          </>
        )}
      </div>
      {kid.pinHash && <button type="button" className="btn primary kid-start" onClick={start}>Dă-i telefonul copilului</button>}
      <details className="set-hint kid-guided">
        <summary>Cum funcționează</summary>
        <ul>
          <li>Copilul vede doar poveștile, fără ștergere, mutare sau rețete.</li>
          <li>La final, povestea începută se termină dacă mai are cel mult 5 minute, apoi aplicația se blochează.</li>
          <li>Ca să ieși: ține apăsat lacătul de sus 2 secunde și scrie PIN-ul.</li>
          <li>PIN-ul și alegerile se salvează în cont; modul copil pornește doar pe telefonul pe care îl apeși.</li>
        </ul>
      </details>
      <details className="set-hint kid-guided">
        <summary>Ca să nu poată ieși deloc din aplicație (iPhone)</summary>
        <ol>
          <li>Setări iPhone › Accesibilitate › Acces ghidat: pornește-l și alege un cod.</li>
          <li>Deschide aplicația, pornește modul copil, apoi apasă de 3 ori butonul lateral și alege Start.</li>
          <li>Ca să ieși: apasă de 3 ori butonul lateral și scrie codul.</li>
        </ol>
        <p>Tot acolo poți bloca butoanele de volum. Pentru un volum mai mic în căști: Setări › Sunete › Siguranța căștilor › Reduce sunetele puternice.</p>
      </details>
      {sheet === 'folders' && (
        <Sheet title={`Ce vede ${child.name || 'copilul'}`} onClose={() => setSheet(undefined)}>
          <div className="set-box kid-folder-list">
            <label className="set-row">
              <span>Toate folderele</span>
              <input type="checkbox" className="switch" checked={!allowed.length} onChange={() => updateSettings({ kid: { folders: [] } })} />
            </label>
            {folders.map((f) => (
              <label className="set-row" key={f}>
                <span>{f}</span>
                <input type="checkbox" className="switch" checked={allowed.includes(f)} onChange={() => toggleFolder(f)} />
              </label>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'new' && <NewPinSheet onClose={() => setSheet(undefined)} />}
      {sheet === 'check' && <CheckPinSheet title="PIN-ul de acum" onClose={() => setSheet(undefined)} onOk={() => setSheet('new')} />}
    </div>
  )
}

/** The bookshelf in each folder: a soft click while leafing through the books (this device only). */
function ShelfSettings() {
  const { shelfClick } = useSettings()
  return (
    <div className="set-group">
      <div className="set-box">
        <label className="set-row">
          <span>Clic și vibrație când răsfoiești cărțile</span>
          <input type="checkbox" className="switch" id="shelf-click" checked={shelfClick}
            onChange={(e) => updateSettings({ shelfClick: e.target.checked })} />
        </label>
      </div>
      <p className="set-hint">Pe raft și în Cover Flow, fiecare carte aleasă face un clic discret și telefonul vibrează scurt (pe iPhone, de la iOS 18). Se aplică doar pe acest dispozitiv.</p>
    </div>
  )
}

/** The child: name, age, gender and reading (used when creating stories), then kid mode. */
function ChildSettings() {
  const { child } = useSettings()
  const age = childAge(child)
  return (
    <>
      <div className="set-group">
        <h2 className="set-label">Despre copil</h2>
        <div className="set-box">
          <label className="set-row">
            <span>Prenume</span>
            <input type="text" id="child-name" value={child.name} placeholder="Ana" autoComplete="off"
              onChange={(e) => updateSettings({ child: { name: e.target.value } })} />
          </label>
          <label className="set-row">
            <span>Anul nașterii{age ? <small className="set-sub">{age} {age === 1 ? 'an' : 'ani'}</small> : null}</span>
            <select id="child-birth-year" value={child.birthYear ?? ''}
              onChange={(e) => updateSettings({ child: { birthYear: e.target.value ? +e.target.value : undefined } })}>
              <option value="">nesetat</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div className="set-row">
            <span id="child-gender-label">Este</span>
            <div className="seg" role="group" aria-labelledby="child-gender-label">
              <button type="button" aria-pressed={child.gender === 'girl'} onClick={() => updateSettings({ child: { gender: child.gender === 'girl' ? undefined : 'girl' } })}>Fetiță</button>
              <button type="button" aria-pressed={child.gender === 'boy'} onClick={() => updateSettings({ child: { gender: child.gender === 'boy' ? undefined : 'boy' } })}>Băiețel</button>
            </div>
          </div>
          <label className="set-row">
            <span>Știe să citească</span>
            <input type="checkbox" className="switch" id="child-can-read" checked={child.canRead}
              onChange={(e) => updateSettings({ child: { canRead: e.target.checked } })} />
          </label>
        </div>
        <p className="set-hint">Când creăm o poveste nouă, folosim automat prenumele, vârsta (din anul nașterii) și dacă e fetiță sau băiețel. Se salvează în cont, la fel pe toate dispozitivele familiei.</p>
      </div>
      <KidSettings />
    </>
  )
}

function ThemeSettings() {
  const { theme } = useSettings()
  return (
    <div className="set-group">
      <div className="set-box">
        <div className="set-row stack">
          <span id="theme-label">Temă</span>
          <div className="seg" role="group" aria-labelledby="theme-label">
            {THEMES.map(([k, label]) => (
              <button type="button" key={k} aria-pressed={theme === k} onClick={() => updateSettings({ theme: k })}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="set-hint">Automat urmează setarea telefonului. Poveștile au mereu culorile cerului.</p>
    </div>
  )
}

/** Everything this space shares with the other accounts, with a switch for each recipe and folder. */
function SharedSettings() {
  const [recipes, setRecipes] = useState<Recipe[]>()
  const [folders, setFolders] = useState<Folder[]>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const load = () => Promise.all([listRecipes(), listStories(), listFolders()]).then(([r, s, f]) => {
    setRecipes(r.filter((x) => x.mine !== false).sort((a, b) => a.title.localeCompare(b.title, 'ro')))
    setFolders(groupFolders(s.filter((x) => x.mine !== false), f.filter((x) => x.mine !== false)).filter((x) => x.mine))
  }).catch(() => setError('Nu am putut încărca lista. Verifică internetul.'))
  useEffect(() => { load() }, [])
  const run = async (key: string, job: () => Promise<unknown>) => {
    setBusy(key); setError('')
    try { await job(); await load() } catch { setError('Nu am putut schimba partajarea. Încearcă din nou.') }
    setBusy(undefined)
  }
  const stories = folders?.flatMap((f) => f.items) ?? []
  return (
    <>
      <p className="set-hint prof-intro">Ce e partajat vede oricine are cont în aplicație. Cei din spațiul tău văd oricum tot.</p>
      <div className="set-group">
        <h2 className="set-label">Povești · {stories.filter((x) => x.shared).length} din {stories.length} partajate</h2>
        <div className="set-box">
          {!folders ? <div className="set-row"><span className="muted">Se încarcă…</span></div> : folders.map((f) => (
            <label className="set-row" key={f.name}>
              <span>{f.icon ? `${f.icon} ` : ''}{f.name}<small className="set-sub">{f.items.length} {f.items.length === 1 ? 'poveste' : 'povești'}</small></span>
              <input type="checkbox" className="switch" checked={f.shared} disabled={!!busy} onChange={(e) => run(`f:${f.name}`, () => setFolderShared(f, e.target.checked))} />
            </label>
          ))}
        </div>
        <p className="set-hint">Poveștile noi sunt partajate de la început. O poveste anume o partajezi din player.</p>
      </div>
      <div className="set-group">
        <h2 className="set-label">Rețete · {recipes?.filter((x) => x.shared).length ?? 0} din {recipes?.length ?? 0} partajate</h2>
        <div className="set-box">
          {!recipes ? <div className="set-row"><span className="muted">Se încarcă…</span></div> : !recipes.length ? <div className="set-row"><span className="muted">Nicio rețetă încă.</span></div> : recipes.map((r) => (
            <label className="set-row" key={r.id}>
              <span>{r.title}{r.category ? <small className="set-sub">{r.category}</small> : null}</span>
              <input type="checkbox" className="switch" checked={!!r.shared} disabled={!!busy} onChange={(e) => run(`r:${r.id}`, () => setRecipeShared(r, e.target.checked))} />
            </label>
          ))}
        </div>
        <p className="set-hint">Rețetele noi rămân doar în spațiul tău până le partajezi.</p>
      </div>
      {error && <p className="set-hint error" role="alert">{error}</p>}
    </>
  )
}

function NameSheet({ onClose }: { onClose: () => void }) {
  const current = useMyName()
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await saveMyName(name); onClose() } catch { setError('Nu am putut salva. Verifică internetul.'); setBusy(false) }
  }
  return (
    <Sheet title="Numele tău" onClose={onClose}>
      <form className="name-form" onSubmit={save}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prenume" aria-label="Numele tău" autoComplete="given-name" maxLength={40} autoFocus />
        {error && <p className="set-hint error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Se salvează…' : 'Salvează'}</button>
      </form>
    </Sheet>
  )
}

const P = {
  child: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
  users: 'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3 3 0 0 1 0 5.6M18 14.3c1.8.8 3 2.6 3 5.7',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  oven: 'M4 4h16v16H4zM4 9h16M8 6.5h.01M12 6.5h.01M8 13h8v4H8z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  down: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  books: 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.2l3.8-1 3.7 15.5-3.8 1z',
}

/** One iOS-style row: colored icon, label (with an optional second line), current value, chevron. */
function Row({ to, icon, color, label, sub, value }: { to: string; icon: keyof typeof P; color: string; label: string; sub?: string; value?: string }) {
  return (
    <Link to={to} className="set-row set-link prof-row">
      <span className="prof-ic" style={{ background: color }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[icon]} /></svg>
      </span>
      <span className="prof-l">{label}{sub && <small className="set-sub">{sub}</small>}</span>
      <span className="set-value">{value}<Chevron /></span>
    </Link>
  )
}

/** "loredana.lehadus@…" -> "Loredana" */
const nameFromEmail = (email: string) => {
  const w = email.split('@')[0].split(/[._\-+\d]/).find(Boolean) ?? email
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const THEME_LABEL: Record<ThemeChoice, string> = { auto: 'Automat', light: 'Luminos', dark: 'Întunecat' }

/** The Profile tab: who you are, the child, people and sharing, preferences, this phone, sign out. */
function ProfileHome() {
  const { theme, child, kid, kitchenTools, city, shelfClick } = useSettings()
  const { user, signOut } = useAuthenticator((c) => [c.user])
  const email = user?.signInDetails?.loginId ?? myEmail()
  const name = useMyName()
  const { members, admin } = useFamily()
  const [counts, setCounts] = useState<{ stories: number; recipes: number }>()
  const [saved, setSaved] = useState<{ count: number; bytes: number }>()
  const [editName, setEditName] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    Promise.all([listStories(), listRecipes()]).then(([s, r]) => setCounts({
      stories: s.filter((x) => x.mine !== false && x.shared).length,
      recipes: r.filter((x) => x.mine !== false && x.shared).length,
    })).catch(() => {})
    const load = () => savedAudioSummary().then(setSaved).catch(() => {})
    load()
    return onOfflineChange(load)
  }, [])
  const age = childAge(child)
  const others = members?.filter((m) => m.sameSpace && m.email !== email?.toLowerCase()).map((m) => nameFromEmail(m.email)) ?? []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <section className="settings profile">
      {/* The title shows in the top bar (App.tsx); this one is for screen readers. */}
      <h1 className="sr-only">Profil</h1>
      <button type="button" className="prof-me" onClick={() => setEditName(true)}>
        <Avatar size={58} />
        <span className="prof-me-text">
          <b>{name || 'Adaugă numele tău'}</b>
          <small>{email}</small>
          <span className="prof-chip">{admin && others.length ? `Spațiul tău · cu ${others.join(', ')}` : `Spațiul ${mySpaceName()}`}</span>
        </span>
        <Chevron />
      </button>

      <div className="set-group">
        <h2 className="set-label">Copilul</h2>
        <div className="set-box">
          <Row to="/profil/copil" icon="child" color="#d9638a" label={child.name || 'Adaugă copilul'}
            sub={[age ? `${age} ${age === 1 ? 'an' : 'ani'}` : '', kid.pinHash ? `modul copil: ${kid.minutes ? `${kid.minutes} min` : 'fără limită'}` : 'modul copil: oprit'].filter(Boolean).join(' · ')} />
        </div>
        {kid.pinHash && <button type="button" className="btn primary kid-start" onClick={() => { startKid(kid.minutes); nav('/povesti/acasa') }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P.lock} /></svg>
          Dă-i telefonul copilului
        </button>}
      </div>

      <div className="set-group">
        <h2 className="set-label">{admin ? 'Familie și partajare' : 'Partajare'}</h2>
        <div className="set-box">
          {admin && <Row to="/profil/persoane" icon="users" color="#3e6a51" label="Persoane" value={members ? String(members.length) : ''} />}
          {admin && <Row to="/profil/invita" icon="mail" color="#3a7fc4" label="Invită pe cineva" />}
          <Row to="/profil/partajare" icon="share" color="#cf7f2a" label="Ce partajez"
            value={counts ? `${plural(counts.stories, 'poveste', 'povești')} · ${plural(counts.recipes, 'rețetă', 'rețete')}` : ''} />
        </div>
      </div>

      <div className="set-group">
        <h2 className="set-label">Preferințe</h2>
        <div className="set-box">
          <Row to="/profil/aspect" icon="sun" color="#7d8a82" label="Aspect" value={THEME_LABEL[theme]} />
          <Row to="/profil/bucatarie" icon="oven" color="#c4664a" label="Bucătăria mea" value={plural(kitchenTools.length, 'aparat', 'aparate')} />
          <Row to="/profil/cer" icon="moon" color="#3b3290" label="Cerul din povești" value={cityByName(city).name} />
        </div>
      </div>

      <div className="set-group">
        <h2 className="set-label">Pe acest telefon</h2>
        <div className="set-box">
          <Row to="/profil/offline" icon="down" color="#2a9d8f" label="Povești fără internet" value={saved ? `${saved.count} · ${fmtSize(saved.bytes)}` : ''} />
          <Row to="/profil/raft" icon="books" color="#8a6d3b" label="Clic pe raft" value={shelfClick ? 'Pornit' : 'Oprit'} />
        </div>
      </div>

      <button type="button" className="prof-out" onClick={signOut}>Ieși din cont</button>
      {editName && <NameSheet onClose={() => setEditName(false)} />}
    </section>
  )
}

const PAGES: Record<string, [string, ComponentType]> = {
  copil: ['Copilul', ChildSettings],
  persoane: ['Persoane', () => <Members me={myEmail()?.toLowerCase()} />],
  invita: ['Invită pe cineva', InviteForm],
  partajare: ['Ce partajez', SharedSettings],
  aspect: ['Aspect', ThemeSettings],
  bucatarie: ['Bucătăria mea', KitchenTools],
  cer: ['Cerul din povești', SkySettings],
  offline: ['Povești fără internet', OfflineStorage],
  raft: ['Raftul cu povești', ShelfSettings],
}

/** The Profile page's title, shown in the top bar instead of the Rețete / Povești switch. */
export function profileTitle(pathname: string, childName?: string) {
  const page = pathname.split('/')[2]
  if (!page) return 'Profil'
  if (page === 'copil' && childName) return childName
  return PAGES[page]?.[0] ?? 'Profil'
}

export default function Profile() {
  const { page } = useParams()
  const { child } = useSettings()
  if (!page) return <ProfileHome />
  const entry = PAGES[page]
  if (!entry) return <Navigate to="/profil" replace />
  const [, Page] = entry
  return (
    <section className="settings">
      <h1 className="sr-only">{profileTitle(`/profil/${page}`, child.name)}</h1>
      <Page />
    </section>
  )
}
