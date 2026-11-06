import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes, listStories } from '../lib/db'
import type { Recipe, Story } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { getLastCook } from '../lib/cooking'
import { getLastStoryId, getPosition } from '../lib/stories'
import { useSkyPhase } from '../lib/sky'
import { formatMinutes } from '../lib/format'
import { useGlow } from '../lib/glow'
import PlatePlaceholder from '../components/PlatePlaceholder'
import StoryCover from '../components/StoryCover'
import HomeHead from '../components/HomeHead'
import { useSyncedList } from '../lib/synced'
import { dayKey, planStore, today } from '../lib/plan'
import { LoadError, Loading } from '../components/LoadState'

const Play = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
)

function Thumb({ r }: { r: Recipe }) {
  const img = useFileUrl(r.photoKey)
  return img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />
}

const meta = (r: Recipe) => [r.minutes && formatMinutes(r.minutes), r.category].filter(Boolean).join(' · ')

/** A recipe as a row: photo, title, time and category (design "Seară de lux"). */
function Row({ r, to }: { r: Recipe; to?: string }) {
  return (
    <Link to={to ?? `/retete/${r.id}`} className="ra-row">
      <span className="ra-thumb"><Thumb r={r} /></span>
      <span className="ra-row-text"><b>{r.title}</b>{meta(r) && <small>{meta(r)}</small>}</span>
    </Link>
  )
}

/** The big card at the top: the dish's photo with what to do next over it. */
function Hero({ r, kicker, action, to }: { r: Recipe; kicker: string; action: string; to: string }) {
  return (
    <Link to={to} className="ra-hero">
      <span className="ra-hero-img"><Thumb r={r} /></span>
      <span className="ra-hero-text">
        <small className="sa-kicker">{kicker}</small>
        <b>{r.title}</b>
        <span className="sa-hero-btn"><Play /> {action}</span>
      </span>
    </Link>
  )
}

/** Tonight's story: the one paused halfway, otherwise a different one each day. */
function pickStory(stories: Story[]) {
  if (!stories.length) return undefined
  const last = stories.find((s) => s.id === getLastStoryId())
  if (last && getPosition(last.id) > 5) return { story: last, resume: true }
  const day = Math.floor(Date.now() / 86400000)
  const pool = stories.length > 1 ? stories.filter((s) => s.id !== last?.id) : stories
  return { story: pool[day % pool.length], resume: false }
}

function StoryCard({ stories, evening }: { stories: Story[]; evening: boolean }) {
  const { child } = useSettings()
  const [pick] = useState(() => pickStory(stories))
  if (!pick) {
    return (
      <Link to="/povesti/adauga" className="ra-story">
        <span className="ra-story-text"><small className="sa-kicker">Povești pentru {child.name || 'cei mici'}</small><b>Adaugă prima poveste</b></span>
      </Link>
    )
  }
  const { story, resume } = pick
  const mins = story.durationSec ? ` · ${Math.max(1, Math.round(story.durationSec / 60))} min` : ''
  return (
    <Link to={`/povesti/${story.id}`} className="ra-story">
      <StoryCover story={story} />
      <span className="ra-story-text">
        <small className="sa-kicker">{resume ? 'Ați rămas la jumătate' : `Pentru ${child.name || 'cei mici'}, ${evening ? 'diseară' : 'la culcare'}`}</small>
        <b>{story.title}</b>
        <small>{resume ? 'Continuă' : 'Ascultă'}{mins}</small>
      </span>
      <span className="ra-story-play" aria-hidden="true"><Play /></span>
    </Link>
  )
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>()
  const [stories, setStories] = useState<Story[]>()
  const offline = useOfflineIds()
  const online = useOnline()
  const [failed, setFailed] = useState(false)
  const load = () => {
    listRecipes().then(setRecipes).catch(() => setFailed(true))
    // Without stories (no internet, nothing saved) the story card simply stays away.
    listStories().then(setStories).catch(() => {})
  }
  useEffect(load, [])

  // Evening as soon as the sun starts going down, like the stories side.
  const evening = useSkyPhase() !== 'day'
  const lastCook = getLastCook()
  const cooking = lastCook && recipes?.find((r) => r.id === lastCook.id)
  const plan = useSyncedList(planStore)
  const todayKey = dayKey(today())
  const menu = (recipes ?? []).length ? plan.filter((e) => e.day === todayKey).map((e) => recipes!.find((r) => r.id === e.recipeId)).filter((r): r is Recipe => !!r) : []
  // The big card: the dish you're cooking, else today's first planned dish, else the newest recipe.
  const hero = cooking ? { r: cooking, kicker: `Continuă · pasul ${lastCook.step + 1}`, action: 'Continuă', to: `/retete/${cooking.id}/gateste` }
    : menu[0] ? { r: menu[0], kicker: ['Azi în plan', menu[0].minutes && formatMinutes(menu[0].minutes)].filter(Boolean).join(' · '), action: 'Gătește pas cu pas', to: `/retete/${menu[0].id}/gateste` }
    : recipes?.[0] ? { r: recipes[0], kicker: 'Adăugată recent', action: 'Vezi rețeta', to: `/retete/${recipes[0].id}` }
    : undefined
  const restOfMenu = menu.filter((r) => r.id !== hero?.r.id)
  const recent = (recipes ?? []).filter((r) => r.id !== hero?.r.id).slice(0, 5)
  const playable = stories && (online ? stories : stories.filter((s) => offline.has(s.id)))
  // The top of the screen glows in the colours of the big card's photo.
  useGlow(hero && { id: hero.r.id, title: hero.r.title, photoKey: hero.r.photoKey })

  return (
    <div className="home">
      <HomeHead search="/cauta" label="Caută rețete, ingrediente sau povești" field="search-input" />
      <h1 className="sa-greeting">Ce gătim azi?</h1>

      {failed && !recipes ? (
        <LoadError text="Nu am putut încărca rețetele. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
      ) : !recipes ? <Loading /> : !hero ? (
        <Link to="/retete/noua" className="home-empty">Nicio rețetă încă. <b>Adaugă prima rețetă</b></Link>
      ) : <Hero {...hero} />}

      {recipes && recipes.length > 0 && (
        <section className="home-sec">
          <div className="sh-sec-head">
            <h2>Azi în meniu</h2>
            <Link to="/saptamana">Săptămâna</Link>
          </div>
          {restOfMenu.length ? (
            <div className="ra-rows">{restOfMenu.map((r, i) => <Row key={`${r.id}-${i}`} r={r} />)}</div>
          ) : (
            <Link to="/saptamana" className="home-empty">{menu.length ? 'Atât pentru azi.' : 'Nimic planificat pentru azi.'} <b>Planifică săptămâna</b></Link>
          )}
        </section>
      )}

      {playable && evening && <StoryCard key={playable.length} stories={playable} evening={evening} />}

      {recent.length > 0 && (
        <section className="home-sec">
          <div className="sh-sec-head">
            <h2>Recente</h2>
            <Link to="/retete">Toate</Link>
          </div>
          <div className="ra-rows">{recent.map((r) => <Row key={r.id} r={r} />)}</div>
        </section>
      )}

      {playable && !evening && <StoryCard key={playable.length} stories={playable} evening={evening} />}
    </div>
  )
}
