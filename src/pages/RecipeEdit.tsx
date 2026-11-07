import { useEffect, useRef, useState } from 'react'
import { errorText } from '../lib/errors'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { generateRecipe, generateRecipePhoto, getRecipe, suggestRecipes, type RecipeIdea, importRecipeFromPhotos, importRecipeFromText, importRecipeFromUrl, newId, removeFile, saveRecipe, uploadFile, type ImportedRecipe } from '../lib/db'
import { parseRecipeText } from '../lib/parseRecipe'
import { resizeImage } from '../lib/resizeImage'
import type { Recipe } from '../lib/types'
import { useBlobUrl } from '../lib/useBlobUrl'
import { useFileUrl } from '../lib/useFileUrl'
import { detectDuration } from '../lib/cooking'
import { parseQuantity } from '../lib/scale'
import { formatMinutes } from '../lib/format'
import PlatePlaceholder from '../components/PlatePlaceholder'
import MicButton from '../components/MicButton'
import { spokenIngredientLines } from '../lib/spokenIngredients'
import { dietSummary, dietText, hasDiet, parseAllergens, parseNutrition } from '../lib/diet'
import { useSettings } from '../lib/settings'
import { canGoBack, useBack } from '../lib/back'
import { guardedWorkDone, useLeaveGuard } from '../lib/leaveGuard'
import { LoadError, Loading } from '../components/LoadState'
import AddArt from '../components/AddArt'
import { clearPickedRecipePages, pickedRecipePages, type RecipeWay } from '../components/NewRecipeFab'

const CATEGORIES = ['Ciorbe și supe', 'Feluri principale', 'Garnituri', 'Salate', 'Deserturi', 'Mic dejun', 'Pentru copii']

type Step = { uid: string; text: string; photoKey?: string; photoBlob?: Blob }
type Mode = 'choose' | 'link' | 'photo' | 'text' | 'generate' | 'fridge' | 'edit'
const WAY_MODE: Record<RecipeWay, Mode> = { link: 'link', poza: 'photo', scriu: 'edit', frigider: 'fridge', genereaza: 'generate', text: 'text' }

/** Photos of one recipe read together: a book's two pages, both sides of a note. */
const MAX_PAGES = 4

function PageThumb({ file, n, onRemove }: { file: File; n: number; onRemove: () => void }) {
  const url = useBlobUrl(file)
  return (
    <li className="photo-page">
      {url && <img src={url} alt={`Pagina ${n}`} />}
      <span className="photo-page-n" aria-hidden="true">{n}</span>
      <button type="button" className="photo-page-x" onClick={onRemove} aria-label={`Scoate pagina ${n}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </li>
  )
}


const empty = (): Recipe => ({ id: newId(), title: '', category: '', ingredients: [], steps: [] })
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const toSteps = (texts: string[], photos: string[] = []): Step[] =>
  texts.map((text, k) => ({ uid: newId(), text, photoKey: photos[k] || undefined }))
/** Everything the editor would save, to tell whether anything changed since it opened. */
const snap = (r: Recipe, ing: string, steps: Step[], photo?: Blob) =>
  JSON.stringify([{ ...r, id: '' }, ing, steps.map((s) => [s.text, s.photoKey ?? '', !!s.photoBlob]), !!photo])

/** Sizes a one-line textarea to its text (called on every render through the ref). */
const fitHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

const LEAVE_EDITS = {
  title: 'Renunți la modificări?',
  text: 'Ce ai schimbat la rețetă nu e salvat. Dacă pleci acum, se pierde.',
  stay: 'Continuă editarea',
  leave: 'Renunță la modificări',
}

function StepItem({ n, step, total, drag, onChange, onMove, onRemove, onGrab }: {
  n: number; step: Step; total: number; drag?: { dy: number; lifted: boolean }
  onChange: (s: Step) => void; onMove: (d: number) => void; onRemove: () => void
  onGrab: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const blobUrl = useBlobUrl(step.photoBlob)
  const savedUrl = useFileUrl(step.photoBlob ? undefined : step.photoKey)
  const url = blobUrl ?? savedUrl
  const secs = detectDuration(step.text)
  return (
    <li className={'edit-step' + (drag?.lifted ? ' lifted' : '') + (drag && !drag.lifted ? ' shifting' : '')} data-uid={step.uid}
      style={drag?.dy ? { transform: `translateY(${drag.dy}px)` } : undefined}>
      <div className="edit-step-side">
        <span className="step-no">{n}</span>
        {/* Drag the grip to reorder; on a keyboard, ↑/↓ on the grip moves the step. */}
        <button type="button" className="step-grip" aria-label={`Mută pasul ${n} (trage, sau săgeți sus/jos)`}
          onPointerDown={onGrab} onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowUp' && n > 1 ? -1 : e.key === 'ArrowDown' && n < total ? 1 : 0
            if (!d) return
            e.preventDefault()
            onMove(d)
            // The step moved in the list (and lost the focus): keep it on its grip, for the next press.
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-uid="${step.uid}"] .step-grip`)?.focus())
          }}>
          <svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true">
            {[3, 10, 17].flatMap((y) => [<circle key={'a' + y} cx="3" cy={y} r="1.6" />, <circle key={'b' + y} cx="9" cy={y} r="1.6" />])}
          </svg>
        </button>
      </div>
      <div className="edit-step-main">
        <textarea id={`step-${step.uid}`} aria-label={`Pasul ${n}`} rows={Math.max(2, Math.ceil(step.text.length / 32))} value={step.text} placeholder="Ce faci la acest pas?"
          onChange={(e) => onChange({ ...step, text: e.target.value })} />
        <div className="edit-step-meta">
          {secs > 0 && <span className="timer-chip">Cronometru {formatMinutes(Math.max(1, Math.round(secs / 60)))}</span>}
          <button type="button" className="link-btn danger-text" onClick={onRemove}>Șterge pasul</button>
        </div>
      </div>
      {url ? (
        <span className="step-photo-thumb">
          <img src={url} alt="" />
          <button type="button" aria-label={`Scoate poza de la pasul ${n}`} onClick={() => onChange({ ...step, photoKey: undefined, photoBlob: undefined })}>×</button>
        </span>
      ) : (
        <label className="step-photo-add">
          + poză
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange({ ...step, photoBlob: f }) }} />
        </label>
      )}
    </li>
  )
}

/** Drag state: which step is lifted, where it started, how far it moved and where it would land. */
type Drag = { uid: string; from: number; to: number; dy: number; h: number; mids: number[] }

export default function RecipeEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const [r, setR] = useState<Recipe>()
  const [original, setOriginal] = useState<Recipe>()
  const [ing, setIng] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [drag, setDrag] = useState<Drag>()
  const [photo, setPhoto] = useState<Blob>()
  // /retete/noua?din=… opens straight on one way (the + sheet on the recipes page; Search links the fridge).
  const [mode, setMode] = useState<Mode>(() => id ? 'edit' : WAY_MODE[new URLSearchParams(window.location.search).get('din') as RecipeWay] ?? 'choose')
  const [link, setLink] = useState('')
  const [paste, setPaste] = useState('')
  // Dictated text has no headings, so it goes to the AI instead of the local parser.
  const [dictated, setDictated] = useState(false)
  // The step that "Dictează un pas" is writing into.
  const dictStep = useRef<string>(undefined)
  const [importing, setImporting] = useState('')
  const [found, setFound] = useState<string>()
  const [saving, setSaving] = useState(false)
  // What the recipe looked like when the editor opened (blank for a new one).
  const [base, setBase] = useState(() => snap(empty(), '', []))
  const [error, setError] = useState('')
  const { kitchenTools, diet } = useSettings()
  // What the family doesn't eat, for the AI (empty: nothing to respect).
  const dietStr = hasDiet(diet) ? dietText(diet) : undefined
  // The ingredients and servings the AI's values were worked out for: changed before saving, they go.
  const factsFor = useRef<string>(undefined)
  const [idea, setIdea] = useState('')
  const [genServings, setGenServings] = useState(4)
  // Tools left out for this one recipe (all of the family's tools are used by default).
  const [skipTools, setSkipTools] = useState<string[]>([])
  const [fridge, setFridge] = useState('')
  const [ideas, setIdeas] = useState<RecipeIdea[]>()
  // Photos picked in the + sheet ("Din poză") arrive with the page.
  const [pages, setPages] = useState<File[]>(() => (!id && mode === 'photo' ? pickedRecipePages() : []))
  useEffect(() => { clearPickedRecipePages() }, [])
  // AI photo: the running job (Save waits for it) and the last unsaved key, removed if replaced.
  const [aiBusy, setAiBusy] = useState(false)
  const aiJob = useRef<Promise<string | undefined>>(undefined)
  const aiUnsaved = useRef<string>(undefined)
  // Photos this editor put in the cloud (from an import or the AI) that no saved recipe uses yet.
  // Leaving without saving deletes them; saving deletes the ones not kept.
  const made = useRef(new Set<string>())
  useEffect(() => () => { for (const k of made.current) removeFile(k).catch(() => {}) }, [])
  // Counts photos you chose yourself; an AI photo that finishes after one of them is thrown away.
  const picked = useRef(0)
  const pickPhoto = (f?: File) => { if (f) { picked.current++; setPhoto(f) } }

  const back = useBack(id ? `/retete/${id}` : '/retete')
  const [loadFailed, setLoadFailed] = useState<'error' | 'missing'>()
  const load = () => {
    if (!id) { setR(empty()); return }
    getRecipe(id).then((x) => {
      if (!x) { setLoadFailed('missing'); return }
      // Another space's recipe can be read, not changed: show it instead of an editor that can't save.
      if (x.mine === false) { nav(`/retete/${x.id}`, { replace: true }); return }
      const st = toSteps(x.steps, x.stepPhotoKeys)
      setR(x); setOriginal(x)
      setIng(x.ingredients.join('\n')); setSteps(st)
      setBase(snap(x, x.ingredients.join('\n'), st))
    }).catch(() => setLoadFailed('error'))
  }
  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Unsaved changes: "Renunță", the tab bar and the iPhone swipe back ask first.
  const dirty = mode === 'edit' && !!r && snap(r, ing, steps, photo) !== base
  useLeaveGuard(dirty && !saving, LEAVE_EDITS)
  const newPhotoUrl = useBlobUrl(photo)
  const savedPhotoUrl = useFileUrl(photo ? undefined : r?.photoKey)
  const img = newPhotoUrl ?? savedPhotoUrl
  if (loadFailed === 'error') return <LoadError text="Nu am putut deschide rețeta. Verifică internetul." onRetry={() => { setLoadFailed(undefined); load() }} />
  if (loadFailed === 'missing') return (
    <div className="not-found">
      <h1>Rețeta nu a fost găsită</h1>
      <p>Poate a fost ștearsă.</p>
      <Link to="/retete" className="btn primary">Rețetele mele</Link>
    </div>
  )
  if (!r) return <Loading />

  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setR({ ...r, [k]: v })

  const fill = (title: string, ingredients: string[], stepTexts: string[], extra: Partial<Recipe> = {}) => {
    setR({ ...r, ...extra, title: title || r.title })
    setIng(ingredients.join('\n')); setSteps(toSteps(stepTexts))
    const vague = ingredients.filter((x) => !parseQuantity(x)).length
    setFound(`Am găsit ${ingredients.length} ingrediente și ${stepTexts.length} pași.` +
      (vague ? ` ${vague === 1 ? 'Un ingredient nu are' : `${vague} ingrediente nu au`} cantitate, verifică-le.` : ' Verifică și salvează.'))
    setMode('edit')
  }

  const applyImport = (x: ImportedRecipe) => {
    if (x.photoKey) made.current.add(x.photoKey)
    const clean = (xs: (string | null)[]) => xs.filter((v): v is string => !!v)
    fill(x.title, clean(x.ingredients), clean(x.steps), {
      category: x.category ?? r.category,
      servings: x.servings ?? undefined,
      minutes: x.minutes ?? undefined,
      notes: x.notes ?? undefined,
      sourceUrl: x.sourceUrl ?? undefined,
      photoKey: x.photoKey ?? r.photoKey,
      nutrition: parseNutrition(x.nutrition),
      allergens: parseAllergens(x.allergens),
    })
    factsFor.current = `${clean(x.ingredients).join('\n')}|${x.servings ?? ''}`
  }

  const makeAiPhoto = (title: string, ingredients: string[]) => {
    if (!title.trim() || aiJob.current) return
    setAiBusy(true)
    const before = picked.current
    const job = generateRecipePhoto(title.trim(), ingredients)
      .then((key) => {
        // You picked your own photo while the AI was drawing: yours stays.
        if (picked.current !== before) { removeFile(key).catch(() => {}); return undefined }
        if (aiUnsaved.current) removeFile(aiUnsaved.current).catch(() => {})
        aiUnsaved.current = key
        made.current.add(key)
        setPhoto(undefined)
        setR((cur) => (cur ? { ...cur, photoKey: key } : cur))
        return key
      })
      .catch((err) => { setError(`Poza AI nu a reușit: ${errorText(err)}`); return undefined })
      .finally(() => { aiJob.current = undefined; setAiBusy(false) })
    aiJob.current = job
  }

  const doImport = async (label: string, run: () => Promise<ImportedRecipe>) => {
    setImporting(label); setError('')
    try {
      const x = await run()
      applyImport(x)
      // No photo from the source (generated or text-only recipes): draw one with AI in the background.
      if (!x.photoKey && !r.photoKey && !photo) makeAiPhoto(x.title, x.ingredients.filter((v): v is string => !!v))
    } catch (err) { setError(`Importul nu a reușit: ${errorText(err)}`) }
    setImporting('')
  }
  const importLink = () => { if (link.trim()) doImport('Citesc rețeta de pe site…', () => importRecipeFromUrl(link.trim())) }
  const addPages = (files: FileList | null) => {
    const xs = [...(files ?? [])].filter((f) => f.type.startsWith('image/') || !f.type)
    if (!xs.length) return
    setPages((cur) => [...cur, ...xs].slice(0, MAX_PAGES))
    setMode('photo')
  }
  const importPhotos = () => {
    if (!pages.length) return
    doImport(pages.length > 1 ? `Citesc rețeta din ${pages.length} poze…` : 'Citesc rețeta din poză…',
      async () => importRecipeFromPhotos(await Promise.all(pages.map((f) => resizeImage(f, 2000, 0.85)))))
  }
  const useTools = kitchenTools.filter((t) => !skipTools.includes(t))
  const runGenerate = () => {
    if (idea.trim()) doImport('Scriu rețeta…', () => generateRecipe(idea.trim(), useTools, genServings, dietStr))
  }
  const runSuggest = async () => {
    if (!fridge.trim()) return
    setImporting('Mă uit ce se poate găti…'); setError('')
    try {
      const xs = await suggestRecipes(fridge.trim(), useTools, dietStr)
      if (!xs.length) setError('Nu am găsit nicio idee. Adaugă mai multe ingrediente.')
      setIdeas(xs)
    } catch (err) { setError(`Nu am putut propune rețete: ${errorText(err)}`) }
    setImporting('')
  }
  const pickIdea = (x: RecipeIdea) => {
    const brief = `${x.title}${x.description ? ` (${x.description})` : ''}. ` +
      `Folosește ce am în frigider: ${fridge.trim()}. Pe lângă asta am doar sare, piper, ulei, apă, zahăr și făină` +
      (x.missing?.length ? `, iar pot cumpăra: ${x.missing.join(', ')}.` : '.')
    doImport(`Scriu rețeta „${x.title}”…`, () => generateRecipe(brief, useTools, genServings, dietStr))
  }

  // What the family doesn't eat, always in sight where recipes are written (Profile › Ce mâncăm).
  const dietRow = hasDiet(diet) ? (
    <Link to="/profil/mancare" className="diet-row-link">
      <span className="diet-shield" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /></svg>
      </span>
      <span className="diet-row-text">{[dietSummary(diet), diet.dislikes.trim() ? `fără ${diet.dislikes.trim()}` : ''].filter(Boolean).join(' · ')}</span>
      <span className="diet-row-change">Schimbă</span>
    </Link>
  ) : null

  const genOptions = (
    <>
    {dietRow}
    <div className="gen-row">
      <span id="gen-serv-label">Porții</span>
      <div className="stepper" role="group" aria-labelledby="gen-serv-label">
        <button type="button" aria-label="Mai puține" disabled={genServings <= 1} onClick={() => setGenServings(genServings - 1)}>−</button>
        <output>{genServings}</output>
        <button type="button" aria-label="Mai multe" disabled={genServings >= 20} onClick={() => setGenServings(genServings + 1)}>+</button>
      </div>
    </div>
    <span id="gen-tools-label" className="gen-label">Aparate folosite</span>
    {kitchenTools.length ? (
      <div className="tool-chips" role="group" aria-labelledby="gen-tools-label">
        {kitchenTools.map((t) => {
          const on = !skipTools.includes(t)
          return <button type="button" key={t} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
            onClick={() => setSkipTools(on ? [...skipTools, t] : skipTools.filter((x) => x !== t))}>{t}</button>
        })}
      </div>
    ) : null}
    <p className="set-hint">
      {kitchenTools.length ? 'Atinge un aparat ca să nu fie folosit la această rețetă. ' : 'Doar aragaz și cuptor. '}
      <Link to="/profil/bucatarie">{kitchenTools.length ? 'Schimbă lista în Profil' : 'Adaugă aparatele tale în Profil'}</Link>
    </p>
    </>
  )

  const importText = () => {
    const text = paste.trim()
    if (!text) return
    const p = parseRecipeText(text)
    // Clear "Ingrediente / Mod de preparare" text is split on the phone; anything looser is read by the AI.
    if (!dictated && p.ingredients.length && p.steps.length) fill(p.title, p.ingredients, p.steps)
    else doImport('Citesc rețeta…', () => importRecipeFromText(text))
  }

  const updateStep = (k: number, s: Step) => setSteps((xs) => xs.map((x, j) => (j === k ? s : x)))
  const moveStep = (k: number, d: number) => setSteps((xs) => {
    const n = [...xs]; const [s] = n.splice(k, 1); n.splice(k + d, 0, s); return n
  })
  const removeStep = (k: number) => setSteps((xs) => xs.filter((_, j) => j !== k))
  /** Adds an empty step at position `at` (the end by default) and puts the cursor in it. */
  const addStep = (at?: number) => {
    const s = { uid: newId(), text: '' }
    setSteps((xs) => { const n = [...xs]; n.splice(at ?? n.length, 0, s); return n })
    requestAnimationFrame(() => {
      const el = document.getElementById(`step-${s.uid}`)
      el?.focus({ preventScroll: true })
      el?.closest('li')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  const grab = (k: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const list = e.currentTarget.closest('ol')
    const items = list ? [...list.querySelectorAll<HTMLElement>(':scope > li.edit-step')] : []
    const me = items[k]
    if (!me) return
    e.preventDefault()
    ;(document.activeElement as HTMLElement | null)?.blur()
    const rects = items.map((x) => x.getBoundingClientRect())
    const gap = items[1] ? rects[1].top - rects[0].bottom : 10
    const h = rects[k].height + gap
    const mids = rects.map((r) => r.top + r.height / 2 + scrollY)
    const y0 = e.clientY + scrollY
    let cur: Drag = { uid: steps[k].uid, from: k, to: k, dy: 0, h, mids }
    setDrag(cur)
    navigator.vibrate?.(8)
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY + scrollY - y0
      const c = mids[k] + dy
      let to = k
      while (to < mids.length - 1 && c > mids[to + 1]) to++
      while (to > 0 && c < mids[to - 1]) to--
      if (to !== cur.to) navigator.vibrate?.(4)
      cur = { ...cur, dy, to }
      setDrag(cur)
      // Scroll the page when the step is held near the top or bottom edge.
      const edge = 80
      if (ev.clientY > window.innerHeight - edge) window.scrollBy(0, 8)
      else if (ev.clientY < edge) window.scrollBy(0, -8)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      const { from, to } = cur
      if (from !== to) setSteps((xs) => { const n = [...xs]; const [s] = n.splice(from, 1); n.splice(to, 0, s); return n })
      setDrag(undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  /** Where each step sits while another one is being dragged. */
  const dragOf = (k: number) => {
    if (!drag) return undefined
    if (k === drag.from) return { dy: drag.dy, lifted: true }
    if (drag.from < k && k <= drag.to) return { dy: -drag.h, lifted: false }
    if (drag.to <= k && k < drag.from) return { dy: drag.h, lifted: false }
    return { dy: 0, lifted: false }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!r.title.trim()) { setError('Scrie un titlu pentru rețetă.'); return }
    setSaving(true); setError('')
    try {
      // An AI photo still being drawn is part of this save.
      const aiKey = aiJob.current ? await aiJob.current : undefined
      let photoKey = aiKey ?? r.photoKey
      if (photo) photoKey = await uploadFile('recipe-photos', await resizeImage(photo), 'jpg')
      const kept = steps.filter((s) => s.text.trim())
      const stepPhotoKeys = await Promise.all(kept.map(async (s) =>
        s.photoBlob ? uploadFile('recipe-photos', await resizeImage(s.photoBlob), 'jpg') : s.photoKey ?? ''))
      // Values and allergens stay only while the ingredients and servings are the ones they were
      // worked out for (an import, or the saved recipe); otherwise they are worked out again later.
      const ingredients = lines(ing)
      const now = `${ingredients.join('\n')}|${r.servings ?? ''}`
      const was = factsFor.current ?? (original ? `${original.ingredients.join('\n')}|${original.servings ?? ''}` : undefined)
      const facts = now === was ? { nutrition: r.nutrition, allergens: r.allergens } : { nutrition: undefined, allergens: undefined }
      await saveRecipe({ ...r, ...facts, photoKey, title: r.title.trim(), ingredients, steps: kept.map((s) => s.text.trim()), stepPhotoKeys }, !id)
      // Clean up photos that were replaced or removed.
      if (original?.photoKey && original.photoKey !== photoKey) await removeFile(original.photoKey)
      for (const k of made.current) if (k !== photoKey) await removeFile(k)
      made.current.clear()
      for (const old of original?.stepPhotoKeys ?? []) if (old && !stepPhotoKeys.includes(old)) await removeFile(old)
      await guardedWorkDone()
      // An edit goes back to the recipe page it came from (no second copy of it in history).
      if (id && canGoBack()) nav(-1)
      else nav(`/retete/${r.id}`, { replace: true })
    } catch (err) {
      setError(`Nu am putut salva rețeta: ${errorText(err)}`)
      setSaving(false)
    }
  }

  if (mode !== 'edit') {
    return (
      <section className="add-recipe">
        {/* "Renunță" closes the page (top right, like an iOS sheet); "‹ Alte variante" steps back to the choices. */}
        {mode !== 'choose' && (
          <button type="button" className="add-recipe-back" onClick={() => { setMode('choose'); setPages([]) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            Alte variante
          </button>
        )}
        <div className="add-recipe-head">
          <h1>Rețetă nouă</h1>
          <button type="button" className="link-btn" onClick={back}>Renunță</button>
        </div>
        {mode === 'choose' && !importing && <p className="add-sub">De unde vine rețeta?</p>}
        {importing ? (
          <p className="importing"><span className="spinner" /> {importing}</p>
        ) : mode === 'link' ? (
          <div className="add-panel">
            <label htmlFor="import-link">Linkul rețetei</label>
            <input id="import-link" type="url" inputMode="url" autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
              onKeyDown={(e) => { if (e.key === 'Enter') importLink() }} />
            <button type="button" className="btn primary big" onClick={importLink} disabled={!link.trim()}>Importă</button>
          </div>
        ) : mode === 'generate' ? (
          <div className="add-panel">
            <label htmlFor="gen-idea">Ce ai vrea să gătești?</label>
            <MicButton value={idea} onChange={setIdea}>
              <textarea id="gen-idea" rows={4} autoFocus value={idea} onChange={(e) => setIdea(e.target.value)}
                placeholder="De exemplu: o ciorbă de pui rapidă, ceva cu dovlecei și brânză, un desert fără zahăr pentru copii" />
            </MicButton>
            {genOptions}
            <button type="button" className="btn primary big" onClick={runGenerate} disabled={!idea.trim()}>Generează rețeta</button>
          </div>
        ) : mode === 'fridge' ? (
          ideas?.length ? (
            <div className="add-panel">
              <span className="gen-label">Alege ce gătești</span>
              {dietRow}
              <div className="ideas">
                {ideas.map((x) => (
                  <button type="button" key={x.title} className="idea" onClick={() => pickIdea(x)}>
                    <b>{x.title}</b>
                    {x.description && <span>{x.description}</span>}
                    <small>
                      {[x.minutes ? formatMinutes(x.minutes) : '', ...(x.tools ?? []).filter((t): t is string => !!t)].filter(Boolean).join(' · ')}
                    </small>
                    {x.missing?.length ? <small className="idea-missing">Îți mai trebuie: {x.missing.join(', ')}</small> : null}
                    {(dietStr || x.kcal) ? (
                      <span className="idea-tags">
                        {dietStr && <span className="idea-fit">potrivit pentru familie</span>}
                        {x.kcal ? <span className="idea-kcal">{x.kcal} kcal / porție</span> : null}
                      </span>
                    ) : null}
                    {x.swaps?.filter(Boolean).length ? <small className="idea-swaps">În loc: {x.swaps.filter(Boolean).join('; ')}</small> : null}
                  </button>
                ))}
              </div>
              <button type="button" className="btn ghost" onClick={() => setIdeas(undefined)}>Schimbă ingredientele</button>
              <button type="button" className="btn ghost" onClick={runSuggest}>Alte idei</button>
            </div>
          ) : (
            <div className="add-panel">
              <label htmlFor="fridge">Ce ai în frigider?</label>
              <MicButton value={fridge} onChange={setFridge}>
                <textarea id="fridge" rows={5} autoFocus value={fridge} onChange={(e) => setFridge(e.target.value)}
                  placeholder="De exemplu: piept de pui, 2 dovlecei, smântână, ouă, o ceapă, orez" />
              </MicButton>
              <p className="set-hint">Sarea, piperul, uleiul, zahărul și făina le considerăm deja în casă.</p>
              {genOptions}
              <button type="button" className="btn primary big" onClick={runSuggest} disabled={!fridge.trim()}>Propune rețete</button>
            </div>
          )
        ) : mode === 'photo' ? (
          <div className="add-panel">
            <span className="gen-label">Pozele rețetei, în ordine</span>
            {pages.length > 0 && (
              <ol className="photo-pages">
                {pages.map((f, i) => <PageThumb key={`${f.name}-${f.lastModified}-${i}`} file={f} n={i + 1} onRemove={() => setPages((cur) => cur.filter((_, j) => j !== i))} />)}
              </ol>
            )}
            {pages.length < MAX_PAGES && (
              <label className="btn photo-more">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {pages.length ? 'Încă o pagină' : 'Alege o poză'}
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPages(e.target.files); e.target.value = '' }} />
              </label>
            )}
            <p className="set-hint">Dacă rețeta e pe două pagini sau pe fața și spatele unui bilet, adaugă toate pozele: le citim împreună, ca o singură rețetă. Cel mult {MAX_PAGES}.</p>
            <button type="button" className="btn primary big" onClick={importPhotos} disabled={!pages.length}>Citește rețeta</button>
          </div>
        ) : mode === 'text' ? (
          <div className="add-panel">
            <label htmlFor="import-text">Lipește, scrie sau dictează rețeta</label>
            <MicButton value={paste} onChange={setPaste} onDictated={() => setDictated(true)}>
              <textarea id="import-text" rows={10} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={'Sarmale\nIngrediente\n- 1 varză murată\n- 500 g carne tocată\nMod de preparare\n1. …'} />
            </MicButton>
            <p className="set-hint">Dictează liber: ce ingrediente pui, cât și cum le gătești. Le aranjăm noi.</p>
            <button type="button" className="btn primary big" onClick={importText} disabled={!paste.trim()}>Completează rețeta</button>
          </div>
        ) : (
          <div className="ways">
            {/* The imports most used come first. */}
            <button type="button" className="way" onClick={() => setMode('link')}>
              <AddArt kind="link" />
              <span><b>Din link</b><small>De pe un blog sau un site</small></span>
            </button>
            <label className="way">
              <AddArt kind="cam" />
              <span><b>Din poză</b><small>Din carte, din caiet sau un bilet, chiar pe mai multe pagini</small></span>
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPages(e.target.files); e.target.value = '' }} />
            </label>
            <button type="button" className="way" onClick={() => setMode('edit')}>
              <AddArt kind="pen" />
              <span><b>Scriu eu</b><small>Titlu, ingrediente și pași</small></span>
            </button>
            <button type="button" className="way" onClick={() => setMode('fridge')}>
              <AddArt kind="fridge" />
              <span><b>Din frigider</b><small>Scrii ce ai, primești idei de rețete</small></span>
            </button>
            <button type="button" className="way" onClick={() => setMode('generate')}>
              <AddArt kind="gen" />
              <span><b>Generează</b><small>Spui ce ai chef, ținem cont de aparatele tale</small></span>
            </button>
            <button type="button" className="way" onClick={() => setMode('text')}>
              <AddArt kind="text" />
              <span><b>Din text sau voce</b><small>O notiță copiată sau o rețetă dictată</small></span>
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    )
  }

  return (
    <form className="editor" onSubmit={save}>
      <div className="editor-bar">
        <button type="button" className="editor-back" data-leaves onClick={back} aria-label="Renunță">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="editor-bar-title">{id ? 'Editează' : 'Rețetă nouă'}</span>
        <button type="submit" className="btn primary small" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</button>
      </div>

      {found && <p className="found">{found}</p>}

      <div className="editor-photo-wrap">
        <label className="editor-photo">
          {img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title || 'rețetă'} />}
          <span className="editor-photo-btn">{img ? 'Schimbă poza' : 'Adaugă o poză'}</span>
          <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>
        {aiBusy
          ? <span className="editor-ai-busy"><span className="spinner" /> Generez o poză…</span>
          : r.title.trim() && <button type="button" className="editor-ai-btn" onClick={() => makeAiPhoto(r.title, lines(ing))}>✨ {img ? 'Altă poză AI' : 'Poză AI'}</button>}
      </div>

      {/* Grows to fit a long name instead of cutting it off; Enter does not add a new line. */}
      <textarea className="editor-title" aria-label="Titlu" required rows={1} value={r.title} placeholder="Numele rețetei" ref={(el) => fitHeight(el)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        onChange={(e) => set('title', e.target.value.replace(/\s*\n\s*/g, ' '))} />

      <div className="editor-fields">
        <label>Categorie
          <input list="cats" value={r.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label>Porții<input type="number" inputMode="numeric" min={1} value={r.servings ?? ''} onChange={(e) => set('servings', e.target.value ? +e.target.value : undefined)} /></label>
        <label>Minute<input type="number" inputMode="numeric" min={1} value={r.minutes ?? ''} onChange={(e) => set('minutes', e.target.value ? +e.target.value : undefined)} /></label>
      </div>

      <section className="editor-section">
        <h2>Ingrediente</h2>
        <p className="set-hint">Câte unul pe rând, cu cantitatea la început (de exemplu „500 g carne tocată”), ca să se poată recalcula porțiile.</p>
        <MicButton value={ing} onChange={setIng} asLines={spokenIngredientLines}
          hint="Spune câte un ingredient, cu o mică pauză între ele.">
          <textarea aria-label="Ingrediente" rows={Math.max(5, lines(ing).length + 1)} value={ing} onChange={(e) => setIng(e.target.value)} />
        </MicButton>
      </section>

      <section className="editor-section">
        <h2>Pași</h2>
        <p className="set-hint">Dacă scrii un timp („10 minute”), apare un cronometru când gătești. Poza unui pas apare pe tot ecranul.{steps.length > 1 && ' Trage de ⠿ ca să muți un pas, sau atinge + ca să adaugi unul între doi pași.'}</p>
        <ol className={'edit-steps' + (drag ? ' dragging' : '')}>
          {steps.map((s, k) => [
            <StepItem key={s.uid} n={k + 1} step={s} total={steps.length} drag={dragOf(k)}
              onChange={(x) => updateStep(k, x)} onMove={(d) => moveStep(k, d)} onRemove={() => removeStep(k)} onGrab={grab(k)} />,
            k < steps.length - 1 && (
              <li key={s.uid + '+'} className="step-insert" aria-hidden={drag ? true : undefined}>
                <button type="button" aria-label={`Adaugă un pas după pasul ${k + 1}`} onClick={() => addStep(k + 1)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </li>
            ),
          ])}
        </ol>
        <div className="steps-add">
          <button type="button" className="btn ghost" onClick={() => addStep()}>+ Adaugă un pas</button>
          <MicButton value="" label="Dictează un pas" hint="Spune pasul, apoi atinge pătratul ca să oprești."
            onStart={() => {
              // Fill the last step if it is still empty, otherwise start a new one.
              const last = steps[steps.length - 1]
              if (last && !last.text.trim() && !last.photoKey && !last.photoBlob) { dictStep.current = last.uid; return }
              const s: Step = { uid: newId(), text: '' }
              dictStep.current = s.uid
              setSteps((xs) => [...xs, s])
            }}
            onChange={(t) => {
              const text = t.charAt(0).toUpperCase() + t.slice(1)
              setSteps((xs) => xs.map((x) => (x.uid === dictStep.current ? { ...x, text } : x)))
            }} />
        </div>
      </section>

      <section className="editor-section">
        <h2>Note</h2>
        <MicButton value={r.notes ?? ''} onChange={(t) => setR((cur) => (cur ? { ...cur, notes: t } : cur))}>
          <textarea aria-label="Note" rows={3} value={r.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </MicButton>
        <label>Link sursă<input type="url" value={r.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value || undefined)} /></label>
      </section>

      {error && <p className="error">{error}</p>}
      <button className="btn primary big" type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează rețeta'}</button>
    </form>
  )
}
