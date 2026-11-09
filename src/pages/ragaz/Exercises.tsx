import { useEffect, useState, type FormEvent } from 'react'
import Sheet from '../../components/Sheet'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import { useMyName } from '../../lib/me'
import type { Exercise } from '../../lib/mind/model'
import { listExercises, removeExercise, saveExercise } from '../../lib/mind/store'
import { deletePack, importPack, listPacks, parsePackText, sharePack, type Pack } from '../../lib/mind/packs'
import '../../ragaz.css'

const PEN = 'M4 20h4L19 9l-4-4L4 16z'

function ExerciseSheet({ value, onClose, onSaved }: { value?: Exercise; onClose: () => void; onSaved: () => void }) {
  const [e, setE] = useState<Exercise>(value ?? { id: crypto.randomUUID(), title: '', steps: '' })
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (patch: Partial<Exercise>) => setE({ ...e, ...patch })
  const save = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!e.title.trim()) return
    // A pack exercise changed here is the person's own from now on: a new import leaves it alone.
    const changed = !!value?.packId && (value.title !== e.title || value.steps !== e.steps || value.category !== e.category || value.minutes !== e.minutes)
    await saveExercise({ ...e, title: e.title.trim(), category: e.category?.trim() || undefined, edited: e.edited || changed })
    onSaved()
  }
  return (
    <Sheet title={value ? 'Exercițiul' : 'Exercițiu nou'} onClose={onClose}>
      <form className="settings rg-form" onSubmit={save}>
        <label className="night-field">Titlul<input value={e.title} maxLength={120} onChange={(x) => set({ title: x.target.value })} placeholder="Plimbare fără telefon" autoFocus={!value} /></label>
        <div className="rg-two">
          <label className="night-field">Categoria<input value={e.category ?? ''} maxLength={60} onChange={(x) => set({ category: x.target.value })} placeholder="Corp și energie" /></label>
          <label className="night-field">Minute<input inputMode="numeric" value={e.minutes ?? ''} onChange={(x) => set({ minutes: Number(x.target.value.replace(/\D/g, '')) || undefined })} placeholder="20" /></label>
        </div>
        <label className="night-field">Ce faci<textarea className="cs-text" rows={8} value={e.steps} onChange={(x) => set({ steps: x.target.value })} placeholder="Pașii exercițiului, cum ți-ar plăcea să-i citești vineri seara." /></label>
        {value?.packId && <p className="set-hint">Din pachetul „{value.packTitle}”{e.edited ? '; l-ai schimbat, așa că rămâne cum l-ai scris.' : '.'}</p>}
        <button type="submit" className="btn primary" disabled={!e.title.trim()}>Salvează</button>
        {value && (confirmDel ? (
          <span className="confirm">Ștergi exercițiul din banca ta?
            <button type="button" className="btn danger small" onClick={() => removeExercise(e.id).then(onSaved)}>Da, șterge</button>
            <button type="button" className="btn small" onClick={() => setConfirmDel(false)}>Nu</button>
          </span>
        ) : <button type="button" className="btn danger small" onClick={() => setConfirmDel(true)}>Șterge din banca mea</button>)}
      </form>
    </Sheet>
  )
}

/** Share exercises with the family: pasted text (the program) or the person's own bank. */
function ShareSheet({ bank, onClose, onShared }: { bank: Exercise[]; onClose: () => void; onShared: () => void }) {
  const myName = useMyName()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [from, setFrom] = useState<'text' | 'bank'>(bank.length ? 'bank' : 'text')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = from === 'text' ? parsePackText(text) : { exercises: bank.map(({ title: t, category, minutes, steps }) => ({ title: t, category, minutes, steps })) }
  const share = async (ev: FormEvent) => {
    ev.preventDefault()
    const name = title.trim() || parsed.title
    if (!name || !parsed.exercises.length) return
    setBusy(true)
    try {
      await sharePack({ title: name, description, author: myName || undefined, exercises: parsed.exercises })
      showToast('Pachetul e partajat în familie.')
      onShared()
    } catch (e) {
      showToast((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Sheet title="Partajează un pachet" onClose={onClose}>
      <form className="settings rg-form" onSubmit={share}>
        <p className="set-hint">Pachetul se vede doar în spațiul vostru. Fiecare își importă o copie și o schimbă cum vrea. Nu se partajează nimic din jurnal.</p>
        <label className="night-field">Numele pachetului<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={parsed.title ?? 'Programul de 28 de zile'} /></label>
        <label className="night-field">Descriere <small>(opțional)</small><input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></label>
        {bank.length > 0 && (
          <div className="pills" role="radiogroup" aria-label="Ce partajezi">
            <button type="button" aria-pressed={from === 'bank'} onClick={() => setFrom('bank')}>Banca mea ({bank.length})</button>
            <button type="button" aria-pressed={from === 'text'} onClick={() => setFrom('text')}>Text lipit</button>
          </div>
        )}
        {from === 'text' && (
          <label className="night-field">Exercițiile
            <textarea className="cs-text" rows={10} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'## Vocea blândă\nCompasiune de sine · 10 min\nCe faci, pas cu pas…\n\n## Micro-auditul energiei\n…'} />
            <small>Fiecare exercițiu începe cu „## Titlu”; pe rândul următor, opțional, „Categorie · 10 min”.</small>
          </label>
        )}
        <p className="set-hint">{parsed.exercises.length ? `${parsed.exercises.length} exerciții: ${parsed.exercises.slice(0, 3).map((e) => e.title).join(', ')}${parsed.exercises.length > 3 ? '…' : ''}` : 'Niciun exercițiu găsit încă.'}</p>
        <button type="submit" className="btn primary" disabled={busy || !parsed.exercises.length || !(title.trim() || parsed.title)}>{busy ? 'Se partajează…' : 'Partajează'}</button>
      </form>
    </Sheet>
  )
}

/** /ragaz/exercitii: the family's packs and the person's own (encrypted) bank. */
export default function Exercises() {
  const [bank, setBank] = useState<Exercise[]>()
  const [packs, setPacks] = useState<Pack[] | null>()
  const [edit, setEdit] = useState<Exercise | 'new'>()
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState('')
  const [delPack, setDelPack] = useState<string>()
  const load = () => {
    listExercises().then(setBank, (e: Error) => showToast(e.message))
    listPacks().then(setPacks, () => setPacks(null))
  }
  useEffect(load, [])
  if (!bank) return <Loading />

  const fromPack = (id: string) => bank.filter((e) => e.packId === id)
  const doImport = (p: Pack) => {
    setBusy(p.id)
    importPack(p).then((n) => { showToast(n ? `Am adăugat ${n} exerciții.` : 'Banca ta e la zi cu pachetul.'); load() }, (e: Error) => showToast(e.message)).finally(() => setBusy(''))
  }
  const groups = [...new Map(bank.map((e) => [e.packId ? e.packTitle ?? 'Pachet' : 'Ale mele', [] as Exercise[]])).keys()]
    .map((name) => ({ name, items: bank.filter((e) => (e.packId ? e.packTitle ?? 'Pachet' : 'Ale mele') === name) }))

  return (
    <section className="ragaz rg-page">
      <div className="rg-head">
        <div><span className="cs-kicker">Răgaz</span><h1>Exercițiile mele</h1></div>
      </div>
      <p className="rg-sub">Importă un pachet, apoi schimbă-l cum vrei. Copia ta nu-i afectează pe ceilalți.</p>

      <div className="rg-sec">
        <h2 className="rg-label">Pachete în familie</h2>
        {packs === undefined ? <Loading /> : packs === null ? <p className="set-hint">Pachetele nu se pot încărca acum (ești offline?).</p> : !packs.length ? (
          <p className="set-hint">Niciun pachet încă.</p>
        ) : packs.map((p) => {
          const have = fromPack(p.id).length
          return (
            <div className="rg-card" key={p.id}>
              <div><b>{p.title}</b><small>{[p.author && `de la ${p.author}`, `${p.exercises.length} exerciții`, have ? `${have} în banca ta` : ''].filter(Boolean).join(' · ')}</small></div>
              {delPack === p.id ? (
                <span className="confirm">
                  <button type="button" className="btn danger small" onClick={() => deletePack(p.id).then(load, (e: Error) => showToast(e.message)).finally(() => setDelPack(undefined))}>Scoate pentru toți</button>
                  <button type="button" className="btn small" onClick={() => setDelPack(undefined)}>Nu</button>
                </span>
              ) : (
                <span className="rg-row-btns">
                  <button type="button" className="btn small" disabled={!!busy} onClick={() => doImport(p)}>{busy === p.id ? '…' : have ? 'Actualizează' : 'Importă'}</button>
                  <button type="button" className="rg-ic-btn" aria-label={`Scoate pachetul ${p.title}`} onClick={() => setDelPack(p.id)}>×</button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="rg-sec">
        <h2 className="rg-label">Banca mea · {bank.length}</h2>
        {!bank.length && <p className="set-hint">Goală deocamdată. Importă un pachet sau scrie un exercițiu.</p>}
        {groups.map((g) => (
          <div className="rg-group" key={g.name}>
            {groups.length > 1 && <small className="rg-group-name">{g.name}</small>}
            {g.items.map((e) => (
              <button type="button" className="rg-ex" key={e.id} onClick={() => setEdit(e)}>
                <span>
                  {e.title}{e.edited && <span className="rg-tag">schimbat</span>}{!e.packId && <span className="rg-tag">al meu</span>}
                  <small>{[e.category, e.minutes && `${e.minutes} min`].filter(Boolean).join(' · ')}</small>
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={PEN} /></svg>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="rg-two">
        <button type="button" className="btn ghost" onClick={() => setEdit('new')}>Adaugă exercițiu</button>
        <button type="button" className="btn ghost" onClick={() => setSharing(true)}>Partajează un pachet</button>
      </div>

      {edit && <ExerciseSheet value={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load() }} />}
      {sharing && <ShareSheet bank={bank.filter((e) => !e.packId || e.edited)} onClose={() => setSharing(false)} onShared={() => { setSharing(false); load() }} />}
    </section>
  )
}
