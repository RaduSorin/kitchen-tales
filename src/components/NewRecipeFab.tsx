import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Sheet from './Sheet'
import AddArt, { type AddArtKind } from './AddArt'

/**
 * How a new recipe starts: /retete/noua?din=… opens the editor straight on that way. `ai` opens
 * AI on "Am chef de…"; the older values (text, frigider, genereaza) still work.
 */
export type RecipeWay = 'link' | 'poza' | 'scriu' | 'ai' | 'frigider' | 'genereaza' | 'text'
// The imports most used come first (same order as on the "Rețetă nouă" page).
const WAYS: { din: RecipeWay; art: AddArtKind; title: string; text: string }[] = [
  { din: 'link', art: 'link', title: 'Din link sau text', text: 'Site, YouTube, TikTok, Instagram sau text' },
  { din: 'poza', art: 'cam', title: 'Din poză', text: 'Din carte, din caiet sau un bilet, chiar pe mai multe pagini' },
  { din: 'ai', art: 'gen', title: 'Cu AI', text: 'Spui ce ai chef sau ce ai în frigider' },
  { din: 'scriu', art: 'pen', title: 'Scriu eu', text: 'Titlu, ingrediente și pași' },
]

// Photos picked in the sheet, handed to the editor it opens (files can't go in the URL).
let pickedPages: File[] = []
export const pickedRecipePages = () => pickedPages
export const clearPickedRecipePages = () => { pickedPages = [] }

/**
 * Phones: the round gold "+" in the recipes header. It opens a sheet from the
 * bottom with the ways to add a recipe; "Din poză" opens the photo picker right from the sheet.
 */
export default function NewRecipeFab({ className = 'head-add' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const onPhotos = (files: FileList | null) => {
    const xs = [...(files ?? [])].filter((f) => f.type.startsWith('image/') || !f.type)
    if (!xs.length) return
    pickedPages = xs
    setOpen(false)
    nav('/retete/noua?din=poza')
  }
  return (
    <>
      <button type="button" className={className} aria-label="Rețetă nouă" title="Rețetă nouă" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open && (
        <Sheet title="Rețetă nouă" grab onClose={() => setOpen(false)}>
          <div className="ways">
            {WAYS.map((w) => {
              const body = <><AddArt kind={w.art} /><span><b>{w.title}</b><small>{w.text}</small></span></>
              return w.din === 'poza'
                ? (
                  <label key={w.din} className="way">
                    {body}
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { onPhotos(e.target.files); e.target.value = '' }} />
                  </label>
                )
                : <Link key={w.din} to={`/retete/noua?din=${w.din}`} className="way" onClick={() => setOpen(false)}>{body}</Link>
            })}
          </div>
        </Sheet>
      )}
    </>
  )
}
