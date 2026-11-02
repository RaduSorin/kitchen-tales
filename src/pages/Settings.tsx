import { useAuthenticator } from '@aws-amplify/ui-react'
import FamilySection from './FamilySection'
import { childAge, updateSettings, useSettings, type ThemeChoice } from '../lib/settings'

const THEMES: [ThemeChoice, string][] = [['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']]
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 15 }, (_, i) => THIS_YEAR - i)

export default function Settings() {
  const { theme, child } = useSettings()
  const { user, signOut } = useAuthenticator((c) => [c.user])
  const age = childAge(child)

  return (
    <section className="settings">
      <h1>Setări</h1>

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
    </section>
  )
}
