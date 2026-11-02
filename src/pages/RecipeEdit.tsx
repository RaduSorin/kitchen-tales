import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getRecipe, importRecipeFromPhoto, importRecipeFromUrl, newId, removeFile, saveRecipe, uploadFile, type ImportedRecipe } from '../lib/db'
import { parseRecipeText } from '../lib/parseRecipe'
import { resizeImage } from '../lib/resizeImage'
import type { Recipe } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { useFileUrl } from '../lib/useFileUrl'

const CATEGORIES = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']

type StepPhoto = { key?: string; blob?: Blob }

function StepPhotoSlot({ n, text, photo, onPick, onRemove }: { n: number; text: string; photo?: StepPhoto; onPick: (f: File) => void; onRemove: () => void }) {
  const blobUrl = useBlobUrl(photo?.blob)
  const savedUrl = useFileUrl(photo?.blob ? undefined : photo?.key || undefined)
  const url = blobUrl ?? savedUrl
  return (
    <li className="step-photo">
      <span className="step-no">{n}</span>
      <span className="step-photo-text">{text}</span>
      {url ? (
        <span className="step-photo-thumb">
          <img src={url} alt="" />
          <button type="button" aria-label={`Scoate poza de la pasul ${n}`} onClick={onRemove}>×</button>
        </span>
      ) : (
        <label className="step-photo-add">
          + poză
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
        </label>
      )}
    </li>
  )
}

const empty = (): Recipe => ({ id: newId(), title: '', category: '', ingredients: [], steps: [] })

export default function RecipeEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe>()
  const [ing, setIng] = useState('')
  const [steps, setSteps] = useState('')
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [photo, setPhoto] = useState<Blob>()
  const [stepPhotos, setStepPhotos] = useState<StepPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [importMode, setImportMode] = useState<'none' | 'link' | 'text'>('none')
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) { setR(empty()); return }
    getRecipe(id).then((x) => {
      const rec = x ?? empty()
      setR(rec); setIng(rec.ingredients.join('\n')); setSteps(rec.steps.join('\n'))
      setStepPhotos((rec.stepPhotoKeys ?? []).map((key) => ({ key: key || undefined })))
    })
  }, [id])
  const newPhotoUrl = useBlobUrl(photo)
  const savedPhotoUrl = useFileUrl(photo ? undefined : r?.photoKey)
  const img = newPhotoUrl ?? savedPhotoUrl
  if (!r) return null

  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setR({ ...r, [k]: v })
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

  const applyPaste = () => {
    const p = parseRecipeText(paste)
    setR({ ...r, title: r.title || p.title })
    setIng(p.ingredients.join('\n')); setSteps(p.steps.join('\n'))
    setShowPaste(false); setPaste('')
  }

  const applyImport = (x: ImportedRecipe) => {
    const clean = (xs: (string | null)[]) => xs.filter((v): v is string => !!v)
    setR({
      ...r,
      title: x.title,
      category: x.category ?? r.category,
      servings: x.servings ?? undefined,
      minutes: x.minutes ?? undefined,
      notes: x.notes ?? undefined,
      sourceUrl: x.sourceUrl ?? undefined,
      photoKey: x.photoKey ?? r.photoKey,
    })
    setIng(clean(x.ingredients).join('\n')); setSteps(clean(x.steps).join('\n'))
    setImportMode('none'); setLink('')
  }

  const doImport = async (label: string, run: () => Promise<ImportedRecipe>) => {
    setImporting(label); setError('')
    try { applyImport(await run()) } catch (err) { setError(`Importul nu a reușit: ${(err as Error).message}`) }
    setImporting('')
  }

  const importLink = () => { if (link.trim()) doImport('Citesc rețeta de pe site…', () => importRecipeFromUrl(link.trim())) }
  const importPhoto = async (f?: File) => {
    if (f) doImport('Citesc rețeta din poză…', async () => importRecipeFromPhoto(await resizeImage(f, 2000, 0.85)))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!r.title.trim()) return
    setSaving(true); setError('')
    try {
      let photoKey = r.photoKey
      if (photo) photoKey = await uploadFile('recipe-photos', await resizeImage(photo), 'jpg')
      const stepList = lines(steps)
      const stepPhotoKeys = await Promise.all(stepList.map(async (_, k) => {
        const p = stepPhotos[k]
        if (p?.blob) return uploadFile('recipe-photos', await resizeImage(p.blob), 'jpg')
        return p?.key ?? ''
      }))
      await saveRecipe({ ...r, photoKey, title: r.title.trim(), ingredients: lines(ing), steps: stepList, stepPhotoKeys }, !id)
      if (photo && r.photoKey && r.photoKey !== photoKey) await removeFile(r.photoKey)
      // Clean up step photos that were replaced, removed, or belonged to deleted steps.
      for (const old of r.stepPhotoKeys ?? []) if (old && !stepPhotoKeys.includes(old)) await removeFile(old)
      nav(`/retete/${r.id}`, { replace: true })
    } catch (err) {
      setError(`Nu am putut salva rețeta: ${(err as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <h1>{id ? 'Editează rețeta' : 'Rețetă nouă'}</h1>

      {!id && (
        <div className="import">
          {importing ? (
            <p className="importing"><span className="spinner" /> {importing}</p>
          ) : importMode === 'link' ? (
            <div className="paste">
              <label>Link către rețetă
                <input type="url" inputMode="url" autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
              </label>
              <div className="row">
                <button type="button" className="btn primary" onClick={importLink} disabled={!link.trim()}>Importă</button>
                <button type="button" className="btn" onClick={() => setImportMode('none')}>Renunță</button>
              </div>
            </div>
          ) : showPaste ? (
            <div className="paste">
              <label>Lipește textul rețetei (titlul pe primul rând)</label>
              <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={'Sarmale\nIngrediente\n- 1 varză murată\n- 500 g carne tocată\nMod de preparare\n1. ...'} />
              <div className="row"><button type="button" className="btn primary" onClick={applyPaste}>Completează automat</button>
                <button type="button" className="btn" onClick={() => setShowPaste(false)}>Renunță</button></div>
            </div>
          ) : (
            <div className="import-buttons">
              <button type="button" className="btn ghost" onClick={() => setImportMode('link')}>🔗 Din link</button>
              <label className="btn ghost">📷 Din poză
                <input type="file" accept="image/*" hidden onChange={(e) => importPhoto(e.target.files?.[0])} />
              </label>
              <button type="button" className="btn ghost" onClick={() => setShowPaste(true)}>📋 Din text</button>
            </div>
          )}
        </div>
      )}

      <label>Titlu<input required value={r.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label>Categorie
        <input list="cats" value={r.category} onChange={(e) => set('category', e.target.value)} />
        <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="row">
        <label>Porții<input type="number" min={1} value={r.servings ?? ''} onChange={(e) => set('servings', e.target.value ? +e.target.value : undefined)} /></label>
        <label>Minute<input type="number" min={1} value={r.minutes ?? ''} onChange={(e) => set('minutes', e.target.value ? +e.target.value : undefined)} /></label>
      </div>
      <label>Poză
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0])} />
      </label>
      {img && <img className="preview" src={img} alt="" />}
      <label>Ingrediente (unul pe rând)<textarea rows={6} value={ing} onChange={(e) => setIng(e.target.value)} /></label>
      <label>Mod de preparare (un pas pe rând)<textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
      {lines(steps).length > 0 && (
        <div className="step-photos">
          <span className="step-photos-label">Poze la pași (opțional)</span>
          <ol>
            {lines(steps).map((text, k) => (
              <StepPhotoSlot key={k} n={k + 1} text={text} photo={stepPhotos[k]}
                onPick={(f) => setStepPhotos((ps) => { const n = [...ps]; n[k] = { blob: f }; return n })}
                onRemove={() => setStepPhotos((ps) => { const n = [...ps]; n[k] = {}; return n })} />
            ))}
          </ol>
        </div>
      )}
      <label>Note<textarea rows={3} value={r.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
      <label>Link sursă<input type="url" value={r.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value || undefined)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</button>
        <button className="btn" type="button" onClick={() => nav(-1)}>Anulează</button>
      </div>
    </form>
  )
}
