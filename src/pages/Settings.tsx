import { useAuthenticator } from '@aws-amplify/ui-react'
import FamilySection from './FamilySection'
import { updateSettings, useSettings, type ThemeChoice } from '../lib/settings'

const THEMES: [ThemeChoice, string][] = [['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']]
const MIN_AGE = 1
const MAX_AGE = 12

export default function Settings() {
  const { theme, child } = useSettings()
  const { user, signOut } = useAuthenticator((c) => [c.user])
  const age = child.age

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
          <div className="set-row">
            <span id="child-age-label">Vârsta</span>
            <div className="stepper" role="group" aria-labelledby="child-age-label">
              <button type="button" aria-label="Mai mic" disabled={!age || age <= MIN_AGE}
                onClick={() => updateSettings({ child: { age: (age ?? MIN_AGE + 1) - 1 } })}>−</button>
              <output>{age ? `${age} ${age === 1 ? 'an' : 'ani'}` : 'nesetat'}</output>
              <button type="button" aria-label="Mai mare" disabled={!!age && age >= MAX_AGE}
                onClick={() => updateSettings({ child: { age: age ? age + 1 : 4 } })}>+</button>
            </div>
          </div>
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
        <p className="set-hint">Folosim prenumele și vârsta când creăm povești noi. Se salvează pe acest dispozitiv.</p>
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
