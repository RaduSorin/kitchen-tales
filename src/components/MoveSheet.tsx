import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import { cachedFolders, createFolder, listFolders, listStories, moveStory } from '../lib/db'
import { builtinFolderOf, FOLDER_ICONS, folderNameProblem, groupFolders, type Folder } from '../lib/stories'
import type { Story } from '../lib/types'

// `note`: the folder's sharing, shown when moving there would change who sees the story.
const Row = ({ label, icon, count, on, busy, onPick, note }: { label: string; icon?: string; count?: number; on: boolean; busy: boolean; onPick: () => void; note?: string }) => (
  <li>
    <button type="button" className="move-row" aria-pressed={on} disabled={busy || on} onClick={onPick}>
      <span className="move-icon" aria-hidden="true">{icon ?? '📁'}</span>
      <span className="move-name">{label}{count !== undefined && <small>{count === 1 ? '1 poveste' : `${count} povești`}{note && ` · ${note}`}</small>}</span>
      {on && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Aici e acum"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
    </button>
  </li>
)

/** "Mută în folder": pick one of the shelf's folders for a story, or make a new one and move it there. */
/** `onMoved` gets the new folder, the story's sharing now, and whether the move changed it. */
export default function MoveSheet({ story, onMoved, onClose }: { story: Story; onMoved: (collection: string | undefined, shared: boolean | undefined, changed: boolean) => void; onClose: () => void }) {
  const [folders, setFolders] = useState<Folder[]>(() => groupFolders([], cachedFolders()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => {
    Promise.all([listStories(), listFolders()]).then(([stories, rows]) => setFolders(groupFolders(stories, rows))).catch(() => {})
  }, [])

  const own = builtinFolderOf(story)
  const targets = folders.filter((f) => !f.builtin && f.mine)
  const move = async (collection: string | undefined, create?: { name: string; icon: string }) => {
    setBusy(true); setError('')
    try {
      // A folder made here keeps the story's sharing: a private story never becomes shared by a move.
      if (create) await createFolder(create.name, create.icon, !!story.shared)
      const { shared, changed } = await moveStory(story, collection ?? null)
      onMoved(collection, shared, changed)
      onClose()
    } catch {
      setError('Nu am putut muta povestea. Încearcă din nou.')
      setBusy(false)
    }
  }
  const addAndMove = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = folderNameProblem(name, folders.map((f) => f.name))
    if (problem) { setError(problem); return }
    move(name.trim(), { name: name.trim(), icon: FOLDER_ICONS[0] })
  }

  return (
    <Sheet title="Mută în folder" onClose={onClose}>
      {adding ? (
        <form className="folder-form" onSubmit={addAndMove}>
          <label className="night-field">Numele folderului nou
            <input value={name} autoFocus maxLength={40} placeholder="Muzică pentru copii" enterKeyHint="done" onChange={(e) => { setName(e.target.value); setError('') }} />
          </label>
          <div className="row">
            <button className="moon-btn" type="submit" disabled={busy || !name.trim()}>{busy ? 'Se mută…' : 'Creează și mută'}</button>
            <button className="btn small" type="button" onClick={() => { setAdding(false); setError('') }}>Renunță</button>
          </div>
        </form>
      ) : (
        <ul className="pick-list move-list">
          <li>
            <button type="button" className="move-row move-new" disabled={busy} onClick={() => setAdding(true)}>
              <span className="move-icon" aria-hidden="true">+</span>
              <span className="move-name">Folder nou</span>
            </button>
          </li>
          {targets.map((f) => (
            <Row key={f.name} label={f.name} icon={f.icon} count={f.items.length} on={story.collection === f.name} busy={busy} onPick={() => move(f.name)}
              note={f.row && !!f.row.shared !== !!story.shared ? (f.row.shared ? 'partajat cu toate conturile' : 'doar în spațiul nostru') : undefined} />
          ))}
          <Row label={own} icon="🏠" on={!story.collection} busy={busy} onPick={() => move(undefined)} />
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </Sheet>
  )
}
