import { useEffect, useMemo, useState } from 'react'
import Sheet from './Sheet'
import { listRecipes } from '../lib/db'
import { useRecipeLogs } from '../lib/recipeLog'
import { reportError } from '../lib/errorReport'
import type { Recipe } from '../lib/types'
import type { CookbookSize, CookbookStyle } from '../lib/cookbook'

type Which = 'all' | 'favorites' | 'categories'
type Phase = { at: 'pick' } | { at: 'making'; done: number; total: number; title: string } | { at: 'ready'; file: File; pages: number } | { at: 'error'; text: string }

const OTHER = 'Altele'
const catOf = (r: Recipe) => r.category?.trim() || OTHER
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0).replace('.', ',')} MB`
const de = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? `de ${many}` : many}`

// The style previews: a tiny page with a photo band and a few lines, in each style's colours.
function StyleArt({ dark }: { dark?: boolean }) {
  const page = dark ? '#14110f' : '#fbf7ef', line = dark ? '#4a423a' : '#d9c9a8', gold = dark ? '#f2c879' : '#a8792a'
  return (
    <svg viewBox="0 0 120 64" aria-hidden="true" className="cb-art">
      <rect width="120" height="64" rx="5" fill={page} />
      <rect width="120" height="26" fill="url(#cbPhoto)" />
      {dark && <rect y="14" width="120" height="13" fill="url(#cbFade)" />}
      <rect x="9" y="33" width="26" height="2.4" rx="1" fill={gold} />
      <rect x="9" y="39" width="58" height="5" rx="1.5" fill={dark ? '#f4efe6' : '#2a231d'} />
      <rect x="9" y="49" width="40" height="2.4" rx="1" fill={line} />
      <rect x="9" y="54" width="48" height="2.4" rx="1" fill={line} />
      <defs>
        <linearGradient id="cbPhoto" x1="0" x2="1"><stop offset="0" stopColor="#b8743a" /><stop offset=".5" stopColor="#d9a54d" /><stop offset="1" stopColor="#6f8a4a" /></linearGradient>
        <linearGradient id="cbFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#14110f" stopOpacity="0" /><stop offset="1" stopColor="#14110f" /></linearGradient>
      </defs>
    </svg>
  )
}

/** Profile › Caietul de rețete: the family's recipes as a PDF book, made on the phone and shared. */
export default function CookbookSheet({ authors, onClose }: { authors?: string; onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>()
  const logs = useRecipeLogs()
  const [which, setWhich] = useState<Which>('all')
  const [cats, setCats] = useState<string[]>([])
  const [style, setStyle] = useState<CookbookStyle>('classic')
  const [photos, setPhotos] = useState(true)
  const [size, setSize] = useState<CookbookSize>('a5')
  const [phase, setPhase] = useState<Phase>({ at: 'pick' })
  const [estimate, setEstimate] = useState<{ pages: number; mb: number }>()

  useEffect(() => {
    // Only this space's recipes: the book is "ours", not what other accounts shared.
    listRecipes().then((list) => setRecipes(list.filter((r) => r.mine !== false))).catch(() => setRecipes([]))
  }, [])

  const categories = useMemo(() => [...new Set((recipes ?? []).map(catOf))].sort((a, b) => a.localeCompare(b, 'ro')), [recipes])
  const favorites = useMemo(() => (recipes ?? []).filter((r) => logs.get(r.id)?.favorite), [recipes, logs])
  const chosen = useMemo(() => {
    if (!recipes) return []
    if (which === 'favorites') return favorites
    if (which === 'categories') return recipes.filter((r) => cats.includes(catOf(r)))
    return recipes
  }, [recipes, which, favorites, cats])

  useEffect(() => {
    // The estimate lives with the PDF code, which loads only once the sheet is open.
    let live = true
    import('../lib/cookbook').then((m) => live && setEstimate(m.estimate(chosen, photos, size))).catch(() => {})
    return () => { live = false }
  }, [chosen, photos, size])

  const make = async () => {
    setPhase({ at: 'making', done: 0, total: 1, title: '' })
    try {
      const { makeCookbook } = await import('../lib/cookbook')
      const { file, pages } = await makeCookbook({
        recipes: chosen, logs, style, size, photos, authors,
        onProgress: (done, total, title) => setPhase({ at: 'making', done, total, title }),
      })
      setPhase({ at: 'ready', file, pages })
    } catch (e) {
      reportError(e, 'cookbook')
      setPhase({ at: 'error', text: 'Nu am reușit să fac PDF-ul. Încearcă din nou, eventual fără poze.' })
    }
  }

  // Sharing needs a fresh tap on iPhone, so it gets its own button once the book is ready.
  const share = async (file: File) => {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Rețetele noastre' }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    open(file)
  }
  const open = (file: File) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const toggleCat = (c: string) => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))
  const recipeIndex = phase.at === 'making' && chosen.length ? Math.min(chosen.length, Math.floor((phase.done / phase.total) * chosen.length) + 1) : 0

  return (
    <Sheet title="Caietul de rețete" onClose={onClose} grab>
      {phase.at === 'pick' && (
        <div className="cb">
          <p className="cb-intro">Un PDF cu rețetele voastre, de păstrat, trimis sau tipărit.</p>

          <h3 className="cb-label">Ce intră</h3>
          <div className="seg cb-seg" role="group" aria-label="Ce intră">
            <button type="button" aria-pressed={which === 'all'} onClick={() => setWhich('all')}>Toate<small>{recipes ? recipes.length : '…'}</small></button>
            <button type="button" aria-pressed={which === 'favorites'} onClick={() => setWhich('favorites')} disabled={!favorites.length}>Favorite<small>{favorites.length}</small></button>
            <button type="button" aria-pressed={which === 'categories'} onClick={() => setWhich('categories')}>Alese<small>categorii</small></button>
          </div>
          {which === 'categories' && (
            <div className="tool-chips cb-cats" role="group" aria-label="Categorii">
              {categories.map((c) => <button type="button" key={c} className={`chip${cats.includes(c) ? ' on' : ''}`} aria-pressed={cats.includes(c)} onClick={() => toggleCat(c)}>{c}</button>)}
            </div>
          )}

          <h3 className="cb-label">Stil</h3>
          <div className="cb-styles" role="group" aria-label="Stil">
            <button type="button" className="cb-style" aria-pressed={style === 'classic'} onClick={() => setStyle('classic')}><StyleArt /><span>Clasic</span></button>
            <button type="button" className="cb-style" aria-pressed={style === 'evening'} onClick={() => setStyle('evening')}><StyleArt dark /><span>Seară</span></button>
          </div>

          <h3 className="cb-label">Mărime</h3>
          <div className="seg cb-seg" role="group" aria-label="Mărime">
            <button type="button" aria-pressed={size === 'a5'} onClick={() => setSize('a5')}>A5<small>recomandat pe telefon</small></button>
            <button type="button" aria-pressed={size === 'a4'} onClick={() => setSize('a4')}>A4<small>recomandat la tipărit</small></button>
          </div>

          <h3 className="cb-label">Poze</h3>
          <div className="seg cb-seg" role="group" aria-label="Poze">
            <button type="button" aria-pressed={photos} onClick={() => setPhotos(true)}>Cu poze</button>
            <button type="button" aria-pressed={!photos} onClick={() => setPhotos(false)}>Fără poze<small>mai mic, bun de tipărit</small></button>
          </div>

          <button type="button" className="btn primary cb-go" onClick={make} disabled={!chosen.length}>Creează PDF-ul</button>
          <p className="cb-est">
            {!recipes ? 'Se încarcă rețetele…'
              : !chosen.length ? (which === 'categories' ? 'Alege cel puțin o categorie.' : 'Nicio rețetă de pus în carte.')
              : estimate ? `${de(chosen.length, 'rețetă', 'rețete')} · aproximativ ${de(estimate.pages, 'pagină', 'pagini')} · ${String(estimate.mb).replace('.', ',')} MB` : ''}
          </p>
        </div>
      )}

      {phase.at === 'making' && (
        <div className="cb cb-making" role="status">
          <div className={`cb-book${style === 'evening' ? ' dark' : ''}`} aria-hidden="true"><b>Rețetele noastre</b><span /></div>
          <h3>Pregătesc caietul…</h3>
          <div className="cb-bar"><span style={{ width: `${Math.round((phase.done / phase.total) * 100)}%` }} /></div>
          <p className="cb-est">{recipeIndex ? `Rețeta ${recipeIndex} din ${chosen.length}${phase.title ? ` · ${phase.title}` : ''}` : ' '}</p>
          <p className="cb-hint">Pozele vin de pe telefon. Merge și fără internet.</p>
        </div>
      )}

      {phase.at === 'ready' && (
        <div className="cb cb-making">
          <div className={`cb-book${style === 'evening' ? ' dark' : ''}`} aria-hidden="true"><b>Rețetele noastre</b><span /></div>
          <h3>Caietul e gata</h3>
          <p className="cb-est">{phase.file.name} · {de(phase.pages, 'pagină', 'pagini')} · {mb(phase.file.size)}</p>
          <button type="button" className="btn primary cb-go" onClick={() => share(phase.file)}>Partajează</button>
          <button type="button" className="btn cb-go" onClick={() => open(phase.file)}>Deschide</button>
          <p className="cb-hint">„Salvează în Fișiere” îl păstrează, „Tipărește” merge direct la imprimantă.</p>
        </div>
      )}

      {phase.at === 'error' && (
        <div className="cb cb-making">
          <p className="set-hint error">{phase.text}</p>
          <button type="button" className="btn primary cb-go" onClick={() => setPhase({ at: 'pick' })}>Înapoi</button>
        </div>
      )}
    </Sheet>
  )
}
