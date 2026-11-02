import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import FamilySection from './FamilySection'
import { childAge, updateSettings, useSettings, type ThemeChoice } from '../lib/settings'
import { PRESET_TOOLS } from '../lib/kitchenTools'

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
      <h2 className="set-label">Bucătăria mea</h2>
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
      <p className="set-hint">Când generezi o rețetă, folosim doar aceste aparate, plus aragazul și cuptorul. Se salvează pe acest dispozitiv.</p>
    </div>
  )
}

type Tab = 'povesti' | 'retete' | 'general'
const TABS: [Tab, string, string][] = [['povesti', 'Povești', '/setari/povesti'], ['retete', 'Rețete', '/setari/retete'], ['general', 'General', '/setari']]

function StorySettings() {
  const { child } = useSettings()
  const age = childAge(child)
  return (
    <>
      <div className="set-group">
        <h2 className="set-label">Copilul</h2>
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
        <p className="set-hint">Când creăm o poveste nouă, folosim automat prenumele, vârsta (din anul nașterii) și dacă e fetiță sau băiețel. Se salvează pe acest dispozitiv.</p>
      </div>
    </>
  )
}

function GeneralSettings() {
  const { theme } = useSettings()
  const { user, signOut } = useAuthenticator((c) => [c.user])
  return (
    <>
      <div className="set-group">
        <h2 className="set-label">Aspect</h2>
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
        <p className="set-hint">Automat urmează setarea telefonului.</p>
      </div>

      <FamilySection me={user?.signInDetails?.loginId?.toLowerCase()} />

      <div className="set-group">
        <h2 className="set-label">Cont</h2>
        <div className="set-box">
          <div className="set-row">
            <span>{user?.signInDetails?.loginId ?? 'Conectat'}</span>
            <button type="button" className="btn small" onClick={signOut}>Ieși din cont</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Settings() {
  const { tab: param } = useParams()
  const tab: Tab = param === 'povesti' || param === 'retete' ? param : 'general'
  return (
    <section className="settings">
      <h1>Setări</h1>
      <nav className="seg set-tabs" aria-label="Secțiuni setări">
        {TABS.map(([k, label, to]) => (
          <NavLink key={k} to={to} end replace aria-current={tab === k ? 'page' : undefined}>{label}</NavLink>
        ))}
      </nav>
      {tab === 'povesti' && <StorySettings />}
      {tab === 'retete' && <KitchenTools />}
      {tab === 'general' && <GeneralSettings />}
    </section>
  )
}
