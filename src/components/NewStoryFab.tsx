import { useState } from 'react'
import { Link } from 'react-router-dom'
import Sheet from './Sheet'
import AddArt, { type AddArtKind } from './AddArt'

export type AddMode = 'record' | 'create' | 'upload'
export const ADD_TITLES: Record<AddMode, string> = { record: 'Citește tu', create: 'Creează o poveste', upload: 'Încarcă un fișier' }
// Creating comes first: it is the one that needs nothing ready.
export const ADD_OPTIONS: { mode: AddMode; art: AddArtKind; text: string }[] = [
  { mode: 'create', art: 'create', text: 'Spui eroul și tema, aplicația o scrie și o citește' },
  { mode: 'record', art: 'record', text: 'Înregistrează-ți vocea citind o carte' },
  { mode: 'upload', art: 'upload', text: 'MP3 sau M4A de pe telefon sau calculator' },
]

/**
 * Phones: the gold "+" floating above the stories tab bar (like "+" on the recipes page). It opens
 * a sheet from the bottom with the three ways to add a story, so the "Poveste nouă" page is skipped.
 * Opened inside one of our folders, the new story goes into that folder.
 */
export default function NewStoryFab({ folder }: { folder?: string }) {
  const [open, setOpen] = useState(false)
  const href = (m: AddMode) => `/povesti/adauga?mod=${m}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`
  return (
    <>
      <button type="button" className="fab-new" aria-label="Adaugă o poveste" title="Adaugă o poveste" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open && (
        <Sheet title="Poveste nouă" grab onClose={() => setOpen(false)}>
          {folder && <p className="sheet-text add-sheet-hint">Intră direct în „{folder}”</p>}
          <div className="add-opts">
            {ADD_OPTIONS.map((o) => (
              <Link key={o.mode} to={href(o.mode)} className="add-opt" onClick={() => setOpen(false)}>
                <AddArt kind={o.art} />
                <span><b>{ADD_TITLES[o.mode]}</b><small>{o.text}</small></span>
              </Link>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
