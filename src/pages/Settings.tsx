import { useState } from 'react'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { updateSettings, useSettings, type ThemeChoice } from '../lib/settings'
import { PRESET_TOOLS } from '../lib/kitchenTools'

const THEMES: [ThemeChoice, string][] = [['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']]
const MIN_AGE = 1
const MAX_AGE = 12

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

      <KitchenTools />

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
