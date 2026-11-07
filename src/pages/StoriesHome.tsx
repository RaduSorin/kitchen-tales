import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cachedFolders, listFolders, listRecipes, listStories, setStoryFavorite } from '../lib/db'
import type { Recipe, Story, StoryFolder } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, folderOf, folderTime, getLastStoryId, getPosition, greeting, groupFolders } from '../lib/stories'
import { useSyncedList } from '../lib/synced'
import { dayKey, planStore, today } from '../lib/plan'
import { useFileUrl } from '../lib/useFileUrl'
import StoryCover from '../components/StoryCover'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { LoadError, Loading } from '../components/LoadState'
import { useGlow } from '../lib/glow'
import { useSkyPhase } from '../lib/sky'
import { useKid } from '../lib/kidMode'
import { KidCorner } from '../components/KidMode'
import HomeHead from '../components/HomeHead'
import Vitrine, { type VitrineSlide } from '../components/Vitrine'
import { newLabel, seenStories } from '../lib/shelf'
import { showToast } from '../lib/toast'

/** Tonight's stories: a different set each day, starting with the story of the day, without the one to continue. */
function storiesOfTheDay(stories: Story[], day: number, skip?: string, n = 8) {
  const pool = stories.length > 1 ? stories.filter((s) => s.id !== skip) : stories
  if (!pool.length) return []
  const start = day % pool.length
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, n)
}

const minutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`

/** A row of covers with the length on each and the folder under the title. */
function Row({ title, to, stories, from }: { title: string; to?: string; stories: Story[]; from?: 'favorites' }) {
  if (!stories.length) return null
  return (
    <section className="sh-sec">
      <div className="sh-sec-head"><h2>{title}</h2>{to && <Link to={to}>Toate</Link>}</div>
      <div className="sh-row">
        {stories.map((s) => (
          <Link key={s.id} to={`/povesti/${s.id}`} state={from ? { fromFolder: true, from } : { fromFolder: true }} className="cover-card sh-card">
            <span className="sa-cover">
              <StoryCover story={s} />
              {s.durationSec ? <span className="sa-dur">{minutes(s.durationSec)}</span> : null}
            </span>
            <span className="cover-title">{s.title}</span>
            <small className="cover-meta">{folderOf(s)}</small>
          </Link>
        ))}
      </div>
    </section>
  )
}

const Heart = ({ on }: { on: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-9-5.4-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.6-9 12-9 12z" />
  </svg>
)

/** A folder as a collection card, like on the shelf: tinted from its covers, three of them on the right. */
function Collection({ name, icon, items, fresh }: { name: string; icon?: string; items: Story[]; fresh: number }) {
  const art = [...items.filter((s) => s.coverKey), ...items.filter((s) => !s.coverKey)]
  const started = items.filter((s) => getPosition(s.id) > 5).length
  const time = folderTime(items)
  return (
    <Link to={`/povesti?folder=${encodeURIComponent(name)}`} className="collection sh-coll">
      {art[0] && <StoryCover story={art[0]} className="collection-tint" />}
      <span className="collection-text">
        <span className="cover-title">{icon && <span aria-hidden="true">{icon} </span>}{name}</span>
        <small className="cover-meta">{items.length} {items.length === 1 ? 'poveste' : 'povești'}{time && ` · ${time}`}</small>
        {(fresh > 0 || started > 0) && (
          <span className="collection-tags">
            {fresh > 0 && <span className="tag-new">{newLabel(fresh)}</span>}
            {started > 0 && <span>{started} în curs</span>}
          </span>
        )}
      </span>
      <span className={`collection-covers n${Math.min(3, art.length)}`} aria-hidden="true">
        {art.slice(0, 3).reverse().map((s) => <StoryCover key={s.id} story={s} />)}
      </span>
    </Link>
  )
}

function RecipePeek({ r, label }: { r: Recipe; label: string }) {
  const img = useFileUrl(r.photoKey)
  return (
    <Link to={`/retete/${r.id}`} className="sh-recipe">
      <span className="sh-recipe-img">{img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />}</span>
      <span className="sh-recipe-text"><small>{label}</small><b>{r.title}</b></span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </Link>
  )
}

/**
 * "Acasă" in the stories area, design "Vitrina de seară": the cover fills the top of the screen
 * (swipe between the story to continue, tonight's story and the newest), then tonight's stories,
 * the folders as collection cards, favourites, the newest and a peek at the kitchen.
 */
export default function StoriesHome() {
  const { child } = useSettings()
  const online = useOnline()
  const offline = useOfflineIds()
  const [stories, setStories] = useState<Story[]>()
  const [rows, setRows] = useState<StoryFolder[]>(cachedFolders)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const plan = useSyncedList(planStore)
  const [{ hour, day }] = useState(() => ({ hour: new Date().getHours(), day: Math.floor(Date.now() / 86400000) }))
  const [seen] = useState(seenStories)
  const sky = useSkyPhase()
  const kid = useKid().active
  const [failed, setFailed] = useState(false)
  const load = () => {
    listStories().then(setStories).catch(() => setFailed(true))
    listFolders().then(setRows).catch(() => {})
    listRecipes().then(setRecipes).catch(() => {})
  }
  useEffect(load, [])

  const available = (stories ?? []).filter((s) => online || offline.has(s.id))
  const last = available.find((s) => s.id === getLastStoryId())
  const lastPos = last ? getPosition(last.id) : 0
  // "Tonight" as soon as the sun starts going down (earlier in winter).
  const evening = sky !== 'day'
  const continuing = last && lastPos > 5 ? last : undefined
  const tonight = storiesOfTheDay(available, day, continuing?.id)
  const forChild = child.name ? ` pentru ${child.name}` : ''
  const length = (s: Story) => [folderOf(s), s.durationSec && minutes(s.durationSec)].filter(Boolean).join(' · ')

  // The covers on top: the story to continue, the story of the day, the newest story.
  const slides: { story: Story; kicker: string; meta?: string; progress?: number; action: string }[] = []
  const add = (x: (typeof slides)[number] | false | undefined) => { if (x && !slides.some((y) => y.story.id === x.story.id)) slides.push(x) }
  add(continuing && {
    story: continuing, action: 'Continuă',
    kicker: `Continuă · ${continuing.durationSec ? `mai sunt ${minutes(Math.max(0, continuing.durationSec - lastPos))}` : `de la ${fmtTime(lastPos)}`}`,
    meta: length(continuing), progress: continuing.durationSec ? Math.min(1, lastPos / continuing.durationSec) : undefined,
  })
  add(tonight[0] && { story: tonight[0], action: 'Ascultă', kicker: evening ? `Povestea de diseară${forChild}` : 'Povestea zilei', meta: length(tonight[0]) })
  add(available[0] && { story: available[0], action: 'Ascultă', kicker: 'Adăugată recent', meta: length(available[0]) })
  for (const s of tonight) { if (slides.length >= 3) break; add({ story: s, action: 'Ascultă', kicker: evening ? 'Tot pentru diseară' : 'Tot pentru azi', meta: length(s) }) }

  const slideKey = slides.map((x) => x.story.id).join()
  const [pos, setPos] = useState({ key: '', i: 0 })
  const active = Math.min(pos.key === slideKey ? pos.i : 0, Math.max(0, slides.length - 1))
  const shown = slides[active]?.story
  // The page glows in the colours of the cover on screen.
  useGlow(shown)

  // The heart on top: marked at once, put back if it could not be saved.
  const [hearts, setHearts] = useState<Record<string, boolean>>({})
  const isFav = (s: Story) => hearts[s.id] ?? !!s.favorite
  const toggle = async (s: Story) => {
    const on = !isFav(s)
    setHearts((h) => ({ ...h, [s.id]: on }))
    try { await setStoryFavorite(s, on) } catch {
      setHearts((h) => ({ ...h, [s.id]: !on }))
      showToast('Nu am putut salva la favorite.')
    }
  }

  const onTop = new Set(slides.map((x) => x.story.id))
  const tonightRow = tonight.filter((s) => !onTop.has(s.id))
  const folders = groupFolders(available, online && !kid ? rows : []).filter((f) => f.items.length > 0)
  const unseen = (items: Story[]) => (seen ? items.filter((s) => !(s.id in seen)).length : 0)
  const favorites = available.filter((s) => isFav(s)).slice(0, 10)
  const recent = available.slice(0, 10) // the list comes newest first
  const todayKey = dayKey(today())
  const cooking = plan.filter((e) => e.day === todayKey).map((e) => recipes.find((r) => r.id === e.recipeId)).filter((r): r is Recipe => !!r)
  const head = kid ? <div className="home-head kid-head"><KidCorner /></div> : <HomeHead search="/povesti?cauta=1" label="Caută o poveste" field="story-search" />
  const hello = `${evening && hour >= 12 ? 'Bună seara' : greeting()}${child.name ? `, ${child.name}` : ''}`

  const kitchen = !kid && (
    <section className="sh-sec">
      <div className="sh-sec-head"><h2>Din bucătărie</h2><Link to="/saptamana">Săptămâna</Link></div>
      {cooking.length
        ? cooking.slice(0, 2).map((r) => <RecipePeek key={r.id} r={r} label="Azi în meniu" />)
        : recipes[0] ? <RecipePeek r={recipes[0]} label="Rețetă recentă" /> : <Link to="/retete" className="sh-recipe"><span className="sh-recipe-text"><b>Rețetele mele</b></span></Link>}
    </section>
  )

  if (!slides.length) {
    return (
      <section className="stories-home">
        {head}
        <h1 className="sa-greeting">{hello}</h1>
        {failed && !stories ? <LoadError text="Nu am putut încărca poveștile. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
          : stories === undefined ? <Loading /> : kid ? <p className="empty">Nicio poveste aici încă.</p> : (
          <Link to="/povesti/adauga" className="continue sh-empty">
            <span className="continue-text"><b>Nicio poveste încă</b><small>Adaugă prima poveste: încarci, înregistrezi sau o creăm împreună</small></span>
            <span className="continue-play" aria-hidden="true">+</span>
          </Link>
        )}
        {kitchen}
      </section>
    )
  }

  return (
    <section className="stories-home vitrina">
      <h1 className="sr-only">{hello}</h1>
      {/* New stories on top (the list arriving, the one to continue changing): start again from the first. */}
      <Vitrine key={slideKey} cover label="De ascultat" active={active} onActive={(i) => setPos({ key: slideKey, i })} head={head}
        slides={slides.map((x): VitrineSlide => ({
          id: x.story.id, art: <StoryCover story={x.story} />, blur: <StoryCover story={x.story} />,
          kicker: x.kicker, title: x.story.title, href: `/povesti/${x.story.id}`, meta: x.meta, progress: x.progress,
          action: x.action, actionTo: `/povesti/${x.story.id}`, actionState: { fromFolder: true },
          side: (
            <button type="button" className={isFav(x.story) ? 'vt-round on' : 'vt-round'} aria-pressed={isFav(x.story)}
              aria-label={isFav(x.story) ? 'Scoate de la favorite' : 'Adaugă la favorite'} onClick={() => toggle(x.story)}>
              <Heart on={isFav(x.story)} />
            </button>
          ),
        }))} />

      <Row title={evening ? 'Pentru diseară' : 'Pentru azi'} to="/povesti" stories={tonightRow} />

      {folders.length > 0 && (
        <section className="sh-sec">
          <div className="sh-sec-head"><h2>Colecții</h2><Link to="/povesti">Bibliotecă</Link></div>
          <div className="collections">
            {folders.map((f) => <Collection key={f.name} name={f.name} icon={f.icon} items={f.items} fresh={unseen(f.items)} />)}
          </div>
        </section>
      )}

      <Row title="Favorite" to="/povesti?favorite=1" stories={favorites} from="favorites" />
      <Row title="Adăugate recent" to="/povesti" stories={recent.filter((s) => !onTop.has(s.id))} />
      {kitchen}
    </section>
  )
}
