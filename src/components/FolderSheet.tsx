import { useState } from 'react'
import Sheet from './Sheet'
import { FOLDER_ICONS, folderNameProblem } from '../lib/stories'

type Props = {
  /** The folder being edited; without it the sheet makes a new folder. */
  folder?: { name: string; icon?: string; count: number; fallback?: string }
  /** Every folder name on the shelf, so a name isn't used twice. */
  taken: string[]
  onSave: (name: string, icon?: string) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

/** Make a new folder, or rename / change the icon of / delete an existing one. */
export default function FolderSheet({ folder, taken, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(folder?.name ?? '')
  const [icon, setIcon] = useState<string | undefined>(folder ? folder.icon : FOLDER_ICONS[0])
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const problem = folderNameProblem(name, taken, folder?.name)
  const changed = !folder || name.trim() !== folder.name || icon !== folder.icon

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true); setError('')
    try { await work(); onClose() } catch { setError(failed); setBusy(false) }
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (problem) { setError(problem); return }
    run(() => onSave(name.trim(), icon), 'Nu am putut salva folderul. Încearcă din nou.')
  }

  return (
    <Sheet title={folder ? 'Editează folderul' : 'Folder nou'} onClose={onClose}>
      <form className="folder-form" onSubmit={save}>
        <label className="night-field">Numele folderului
          <input value={name} autoFocus={!folder} maxLength={40} placeholder="Muzică pentru copii" enterKeyHint="done"
            onChange={(e) => { setName(e.target.value); setError('') }} />
        </label>
        <div className="night-field" role="group" aria-label="Iconița folderului">Iconiță
          <div className="emoji-pick">
            {FOLDER_ICONS.map((x) => (
              <button type="button" key={x} className={x === icon ? 'on' : ''} aria-pressed={x === icon} onClick={() => setIcon(x === icon ? undefined : x)}>{x}</button>
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="moon-btn" type="submit" disabled={busy || !changed || !name.trim()}>
          {busy ? 'Se salvează…' : folder ? 'Salvează' : 'Creează folderul'}
        </button>
      </form>
      {folder && onDelete && (confirm ? (
        <div className="folder-delete">
          <p>Folderul dispare{folder.count
            ? `, ${folder.count === 1 ? 'povestea rămâne' : `cele ${folder.count} povești rămân`} în ${folder.fallback ?? 'folderele lor de bază'}.`
            : '.'}</p>
          <div className="confirm">
            <button type="button" className="btn danger small" disabled={busy} onClick={() => run(onDelete, 'Nu am putut șterge folderul. Încearcă din nou.')}>Da, șterge folderul</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => setConfirm(false)}>Nu</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn danger small folder-delete-btn" onClick={() => setConfirm(true)}>Șterge folderul</button>
      ))}
    </Sheet>
  )
}
