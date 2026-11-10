import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe, setRecipeShared } from '../lib/db'
import ShareIcon from '../components/ShareIcon'
import RecipeFacts from '../components/RecipeFacts'
import { showToast } from '../lib/toast'
import type { Recipe } from '../lib/types'
import { keepPhotos, useFileUrl } from '../lib/useFileUrl'
import { isHeading, scaleIngredient } from '../lib/scale'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { formatMinutes } from '../lib/format'
import { getProgress } from '../lib/cooking'
import Sheet from '../components/Sheet'
import PopMenu, { MENU_ICON, MenuRow } from '../components/PopMenu'
import { LoadError, Loading } from '../components/LoadState'
import { useSyncedList } from '../lib/synced'
import { addDays, addToShopping, dayKey, dayName, forgetRecipe, planRecipe, planStore, shortDate, today } from '../lib/plan'
import { useBack } from '../lib/back'
import { useOnline } from '../lib/useOffline'
import { addCookNote, cookedLabel, forgetRecipeLog, removeCookNote, setRecipeFavorite, sinceLabel, useRecipeLog } from '../lib/recipeLog'
import { useMyName } from '../lib/me'
import { track } from '../lib/badges/store'

const HEART = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z'

/** The heart next to a recipe's title: the space's favourites, also for recipes others shared. */
export function RecipeHeart({ recipeId, favorite }: { recipeId: string; favorite: boolean }) {
  return (
    <button type="button" className={`recipe-fav${favorite ? ' on' : ''}`} aria-pressed={favorite}
      aria-label={favorite ? 'Scoate din favorite' : 'Pune la favorite'}
      onClick={() => { setRecipeFavorite(recipeId, !favorite); showToast(favorite ? 'Scoasă din favorite' : 'Pusă la favorite') }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d={HEART} /></svg>
    </button>
  )
}

/** Notes written after cooking, newest first, and a way to add one. */
function CookNotes({ recipeId }: { recipeId: string }) {
  const log = useRecipeLog(recipeId)
  const me = useMyName()
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const notes = [...(log?.notes ?? [])].reverse()
  const save = () => { addCookNote(recipeId, text, me || undefined); setText(''); setWriting(false) }
  return (
    <section className="cook-notes">
      <div className="section-head">
        <h2>Notele noastre</h2>
        {!writing && <button type="button" className="btn small" onClick={() => setWriting(true)}>Adaugă o notă</button>}
      </div>
      {writing && (
        <form className="cook-note-form" onSubmit={(e) => { e.preventDefault(); save() }}>
          <textarea autoFocus rows={2} maxLength={500} placeholder="ex. mai puțină sare, copilului i-a plăcut" value={text} onChange={(e) => setText(e.target.value)} />
          <div>
            <button type="submit" className="btn primary small" disabled={!text.trim()}>Salvează</button>
            <button type="button" className="btn small" onClick={() => { setWriting(false); setText('') }}>Renunță</button>
          </div>
        </form>
      )}
      {notes.length > 0 ? (
        <ul className="cook-note-list">
          {notes.map((n) => (
            <li key={`${n.day}|${n.by}|${n.text}`}>
              <p>{n.text}</p>
              <small>{n.by ? `${n.by} · ` : ''}{sinceLabel(n.day)}
                <button type="button" className="link-btn" aria-label="Șterge nota" onClick={() => removeCookNote(recipeId, n)}>Șterge</button>
              </small>
            </li>
          ))}
        </ul>
      ) : !writing && <p className="muted-note">Ce ați schimba data viitoare? Scrieți aici după ce o gătiți.</p>}
    </section>
  )
}

/** Choose a day in the next two weeks; days that already have this recipe are marked. */
export function DayPicker({ r, servings, onDone, onClose }: { r: Recipe; servings?: number; onDone: (msg: string) => void; onClose: () => void }) {
  const plan = useSyncedList(planStore)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i))
  return (
    <Sheet title="Când o gătești?" onClose={onClose}>
      <ul className="pick-list day-pick">
        {days.map((d, i) => {
          const k = dayKey(d)
          const planned = plan.some((e) => e.day === k && e.recipeId === r.id)
          return (
            <li key={k}>
              <button type="button" onClick={() => { planRecipe(r, k, servings); onDone(`Adăugată ${i === 0 ? 'azi' : i === 1 ? 'mâine' : `${dayName(d).toLowerCase()}, ${shortDate(d)}`}.`) }}>
                <span><b>{i === 0 ? 'Azi' : i === 1 ? 'Mâine' : dayName(d)}</b> <small>{shortDate(d)}</small></span>
                {planned && <small className="day-pick-on">deja în plan</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/** Another recipe opened on the same page starts fresh (nothing ticked, first tab). */
export default function RecipeView() {
  const { id } = useParams()
  return <RecipePage key={id} />
}

function RecipePage() {
  const { id } = useParams()
  const [r, setR] = useState<Recipe | null>()
  const [have, setHave] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<Set<number>>(new Set())
  const [servings, setServings] = useState<number>()
  const [confirming, setConfirming] = useState(false)
  const [menu, setMenu] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [tab, setTab] = useState<'ingrediente' | 'pasi' | 'note'>('ingrediente')
  const [failed, setFailed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [sharing, setSharing] = useState(false)
  const share = async (x: Recipe, shared: boolean) => {
    setSharing(true); setDeleteError('')
    try {
      await setRecipeShared(x, shared)
      setR({ ...x, shared })
      showToast(shared ? 'Rețeta e partajată cu toate conturile' : 'Rețeta e acum doar în spațiul nostru')
    } catch { setDeleteError('Nu am putut schimba partajarea. Încearcă din nou.') }
    setSharing(false)
  }
  const online = useOnline()
  const log = useRecipeLog(id)
  const navigate = useNavigate()
  const closeMenu = useCallback(() => { setMenu(false); setConfirming(false); setDeleteError('') }, [])
  // After deleting, step back to where the recipe was opened from rather than adding a page on
  // top (Back would then lead to the deleted recipe).
  const leave = useBack('/retete')
  const remove = async (x: Recipe) => {
    setDeleting(true); setDeleteError('')
    try {
      await deleteRecipe(x)
      forgetRecipe(x.id)
      forgetRecipeLog(x.id)
      leave()
    } catch {
      setDeleteError('Nu am putut șterge rețeta. Verifică internetul și încearcă din nou.')
      setDeleting(false)
    }
  }
  const load = () => {
    getRecipe(id!).then((x) => { setR(x ?? null); setServings(x?.servings) }).catch(() => setFailed(true))
  }
  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const img = useFileUrl(r?.photoKey)
  // Step photos too, so cooking mode shows them without internet later.
  const stepKeys = r?.stepPhotoKeys?.join('|') ?? ''
  useEffect(() => { if (stepKeys) keepPhotos(stepKeys.split('|')) }, [stepKeys])
  if (failed) return <LoadError text="Nu am putut deschide rețeta. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
  if (r === undefined) return <Loading />
  if (r === null) return (
    <div className="not-found">
      <h1>Rețeta nu a fost găsită</h1>
      <p>Poate a fost ștearsă.</p>
      <Link to="/retete" className="btn primary">Rețetele mele</Link>
    </div>
  )

  const toBuy = r.ingredients.filter((x) => !isHeading(x)).length
  const toggle = (set: typeof setHave) => (i: number) => set((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const factor = r.servings && servings ? servings / r.servings : 1

  const saved = r.steps.length > 0 ? getProgress(r.id) : null
  const resume = saved != null && saved > 0 && saved < r.steps.length
  const addToList = () => {
    // Ingredients ticked as "I have it" stay off the list.
    const need = r.ingredients.filter((_, i) => !have.has(i))
    const n = addToShopping(r, servings, need)
    showToast(n ? `Am pus ${n} ${n === 1 ? 'ingredient' : 'ingrediente'} în listă.` : 'Sunt deja în listă.', undefined, { action: { label: 'Vezi lista', run: () => navigate('/cumparaturi') } })
  }
  const kicker = [r.category, r.mine === false ? `de la ${r.spaceName ?? 'alt cont'}` : r.shared ? 'partajată' : ''].filter(Boolean).join(' · ')
  const left = toBuy - have.size

  return (
    <article className="recipe rv">
      <div className="recipe-hero">
        {img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}
      </div>
      {/* Heart and ⋯ float on the photo, the ⋯ menu opens under its button, like the story player's. */}
      <span className="menu-anchor hero-more-anchor">
        <RecipeHeart recipeId={r.id} favorite={!!log?.favorite} />
        <button type="button" className="hero-more" aria-label="Opțiuni rețetă" aria-haspopup="menu" aria-expanded={menu}
          onClick={() => { setMenu((o) => !o); setConfirming(false); setDeleteError('') }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
        {menu && (
          <PopMenu label="Opțiuni rețetă" onClose={closeMenu}>
            <small className="folder-menu-label">Rețeta{r.mine !== false && ` · ${r.shared ? 'partajată' : 'doar la noi'}`}</small>
            {r.mine === false ? (
              <p className="menu-note">De la {r.spaceName ?? 'alt cont'}. O poți găti, planifica și pune pe listă, dar nu o poți modifica.</p>
            ) : <>
              {online && (
                <MenuRow icon={MENU_ICON.share} disabled={sharing} onClick={() => share(r, !r.shared)}>
                  {sharing ? 'Se salvează…' : r.shared ? 'Oprește partajarea' : 'Partajează cu toate conturile'}
                </MenuRow>
              )}
              <MenuRow icon={MENU_ICON.pen} onClick={() => { closeMenu(); navigate(`/retete/${r.id}/editeaza`) }}>Editează rețeta</MenuRow>
              {online && (confirming ? (
                <div className="menu-confirm">Ștergi rețeta? Nu se mai poate recupera.
                  <div>
                    <button type="button" className="btn danger small" disabled={deleting} onClick={() => remove(r)}>{deleting ? 'Se șterge…' : 'Da, șterge'}</button>
                    <button type="button" className="btn small" onClick={() => setConfirming(false)}>Nu</button>
                  </div>
                </div>
              ) : <MenuRow icon={MENU_ICON.trash} danger onClick={() => setConfirming(true)}>Șterge rețeta</MenuRow>)}
              {!online && <p className="menu-note">Fără internet poți edita rețeta. Partajarea și ștergerea revin când ai internet.</p>}
              {deleteError && <p className="error menu-note" role="alert">{deleteError}</p>}
            </>}
          </PopMenu>
        )}
      </span>
      <div className="recipe-sheet">
        <header className="rv-head">
          {kicker && <p className="rv-kicker">{r.mine !== false && r.shared && <ShareIcon shared size={13} />}{kicker}</p>}
          <h1>{r.title}</h1>
          <div className="rv-meta">
            {r.minutes ? (
              <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>{formatMinutes(r.minutes)}</span>
            ) : null}
            {r.servings && servings ? (
              <span className="rv-servings" role="group" aria-label="Porții">
                <output>{servings} {servings === 1 ? 'porție' : 'porții'}</output>
                <button type="button" aria-label="Mai puține porții" disabled={servings <= 1} onClick={() => { setServings(servings - 1); track({ t: 'servings' }) }}>−</button>
                <button type="button" aria-label="Mai multe porții" onClick={() => { setServings(servings + 1); track({ t: 'servings' }) }}>+</button>
              </span>
            ) : null}
            {r.steps.length > 0 && <span>{r.steps.length} {r.steps.length === 1 ? 'pas' : 'pași'}</span>}
          </div>
          {cookedLabel(log) && <p className="recipe-cooked">{cookedLabel(log)}</p>}
        </header>

        <div className="rv-tabs" role="tablist" aria-label="Rețeta">
          {(['ingrediente', 'pasi', 'note'] as const).map((t) => (
            <button key={t} type="button" role="tab" id={`rv-tab-${t}`} aria-controls={`rv-panel-${t}`} aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'ingrediente' ? 'Ingrediente' : t === 'pasi' ? 'Pași' : 'Note'}
            </button>
          ))}
        </div>

        {tab === 'ingrediente' && (
          <section className="rv-panel" role="tabpanel" id="rv-panel-ingrediente" aria-labelledby="rv-tab-ingrediente">
            <RecipeFacts r={r} onFacts={(f) => setR((cur) => (cur ? { ...cur, ...f } : cur))} />
            {r.ingredients.length > 0 ? (
              <ul className="checklist">
                {r.ingredients.map((x, i) => isHeading(x) ? (
                  // "Pentru dresat:" groups the lines under it; nothing to tick.
                  <li key={i} className="checklist-heading">{x.trim().replace(/:\s*$/, '')}</li>
                ) : (
                  <li key={i}>
                    <label className={have.has(i) ? 'done' : ''}>
                      <input type="checkbox" checked={have.has(i)} onChange={() => toggle(setHave)(i)} />
                      <span>{scaleIngredient(x, factor)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="muted-note">Rețeta nu are ingrediente.</p>}
            {have.size > 0 && <small className="recipe-plan-hint">Ce ai bifat nu ajunge în lista de cumpărături.</small>}
          </section>
        )}

        {tab === 'pasi' && (
          <section className="rv-panel" role="tabpanel" id="rv-panel-pasi" aria-labelledby="rv-tab-pasi">
            {r.steps.length > 0 ? (
              <ol className="step-list">
                {r.steps.map((x, i) => (
                  <li key={i} className={done.has(i) ? 'done' : ''}>
                    <button type="button" onClick={() => toggle(setDone)(i)} aria-pressed={done.has(i)}>
                      <span className="step-no">{i + 1}</span>
                      <span>{x}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="muted-note">Rețeta nu are încă pași.</p>}
          </section>
        )}

        {tab === 'note' && (
          <section className="rv-panel" role="tabpanel" id="rv-panel-note" aria-labelledby="rv-tab-note">
            {r.notes && <p className="notes">{r.notes}</p>}
            <CookNotes recipeId={r.id} />
            {r.sourceUrl && <p><a href={r.sourceUrl} target="_blank" rel="noreferrer">Sursa originală</a></p>}
          </section>
        )}
      </div>

      {/* The main action stays at the bottom of the screen, with the week and the shopping list beside it. */}
      <div className={`rv-foot${r.steps.length ? '' : ' no-cook'}`}>
        {r.steps.length > 0 && (
          <Link to={`/retete/${r.id}/gateste`} state={{ fromRecipe: true }} className="rv-cook">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 14.5a4 4 0 0 1-.5-7.9 5.5 5.5 0 0 1 11 0 4 4 0 0 1-.5 7.9V19H7z" /><path d="M7 16.5h10" /></svg>
            {resume ? `Continuă de la pasul ${saved! + 1}` : 'Începe să gătești'}
          </Link>
        )}
        <button type="button" className="rv-round" onClick={() => setPlanning(true)} aria-label="Pune în săptămână">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4" /></svg>
          <span>În săptămână</span>
        </button>
        {r.ingredients.length > 0 && (
          <button type="button" className="rv-round" onClick={addToList} aria-label={`Pune în listă${have.size > 0 && left > 0 ? ` (${left})` : ''}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20.5h.01M17 20.5h.01" /></svg>
            <span>Pune în listă</span>
            {have.size > 0 && left > 0 && <b className="rv-count">{left}</b>}
          </button>
        )}
      </div>
      {planning && <DayPicker r={r} servings={servings} onClose={() => setPlanning(false)} onDone={(text) => { setPlanning(false); showToast(text, undefined, { action: { label: 'Vezi săptămâna', run: () => navigate('/saptamana') } }) }} />}
    </article>
  )
}
