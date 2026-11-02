import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes, listStories } from '../lib/db'
import type { Recipe, Story } from '../lib/types'
import { useFileUrl } from '../lib/useFileUrl'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { getLastCook } from '../lib/cooking'
import { getLastStoryId, getPosition, greeting } from '../lib/stories'
import PlatePlaceholder from '../components/PlatePlaceholder'
import StoryCover from '../components/StoryCover'
import { useSyncedList } from '../lib/synced'
import { dayKey, planStore, today } from '../lib/plan'
import { LoadError } from '../components/LoadState'

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
)

function Thumb({ r }: { r: Recipe }) {
  const img = useFileUrl(r.photoKey)
  return img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />
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

function NightCard({ stories, evening }: { stories: Story[]; evening: boolean }) {
  const { child } = useSettings()
  const [pick] = useState(() => pickStory(stories))
  if (!pick) {
    return (
      <Link to="/povesti/adauga" className="home-night">
        <Moon />
        <small>Povești pentru {child.name || 'cei mici'}</small>
        <b>Adaugă prima poveste</b>
        <span className="home-night-btn">Înregistrează sau creează</span>
      </Link>
    )
  }
  const { story, resume } = pick
  const mins = story.durationSec ? ` · ${Math.max(1, Math.round(story.durationSec / 60))} min` : ''
  return (
    <Link to={`/povesti/${story.id}`} className="home-night">
      <Moon />
      <small>{resume ? 'Ați rămas la jumătate' : `Pentru ${child.name || 'cei mici'}, ${evening ? 'diseară' : 'la culcare'}`}</small>
      <span className="home-night-title"><StoryCover story={story} /><b>{story.title}</b></span>
      <span className="home-night-btn">{resume ? 'Continuă' : 'Ascultă'}{mins}</span>
    </Link>
  )
}

const Moon = () => (
  <svg className="home-moon" width="96" height="96" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="22" fill="#ffd76a" /><circle cx="50" cy="32" r="20" fill="#232463" /></svg>
)

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>()
  const [stories, setStories] = useState<Story[]>()
  const offline = useOfflineIds()
  const online = useOnline()
  const [now] = useState(() => new Date())
  const [failed, setFailed] = useState(false)
  const load = () => {
    listRecipes().then(setRecipes).catch(() => setFailed(true))
    // Without stories (no internet, nothing saved) the evening card simply stays away.
    listStories().then(setStories).catch(() => {})
  }
  useEffect(load, [])

  const hour = now.getHours()
  const evening = hour >= 18 || hour < 5
  const date = now.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })
  const lastCook = getLastCook()
  const cooking = lastCook && recipes?.find((r) => r.id === lastCook.id)
  const recent = (recipes ?? []).filter((r) => r.id !== cooking?.id).slice(0, 4)
  const plan = useSyncedList(planStore)
  const todayKey = dayKey(today())
  const menu = (recipes ?? []).length ? plan.filter((e) => e.day === todayKey).map((e) => recipes!.find((r) => r.id === e.recipeId)).filter((r): r is Recipe => !!r) : []
  const playable = stories && (online ? stories : stories.filter((s) => offline.has(s.id)))

  const night = playable && <NightCard key={playable.length} stories={playable} evening={evening} />

  return (
    <div className="home">
      <div className="home-hi">
        <h1>{greeting(now)}</h1>
        <small>{date.charAt(0).toUpperCase() + date.slice(1)}</small>
      </div>

      {evening && night}

      {cooking && (
        <Link to={`/retete/${cooking.id}/gateste`} className="home-continue">
          <span className="home-continue-thumb"><Thumb r={cooking} /></span>
          <span className="home-continue-text"><small>Continuă</small><b>{cooking.title}, pasul {lastCook.step + 1}</b></span>
          <span className="home-continue-go"><Arrow /></span>
        </Link>
      )}

      <section className="home-sec">
        <div className="home-sec-head">
          <h2>Azi în meniu</h2>
          <Link to="/saptamana">Săptămâna mea</Link>
        </div>
        {menu.length ? (
          <div className="home-menu">
            {menu.map((r, i) => (
              <Link key={`${r.id}-${i}`} to={`/retete/${r.id}`} className="home-continue">
                <span className="home-continue-thumb"><Thumb r={r} /></span>
                <span className="home-continue-text"><b>{r.title}</b></span>
                <span className="home-continue-go"><Arrow /></span>
              </Link>
            ))}
          </div>
        ) : (
          <Link to="/saptamana" className="home-empty">Nimic planificat pentru azi. <b>Planifică săptămâna</b></Link>
        )}
      </section>

      <section className="home-sec">
        <div className="home-sec-head">
          <h2>{recent.length ? 'Rețete recente' : 'Rețete'}</h2>
          <Link to="/retete">Toate</Link>
        </div>
        {failed && !recipes ? (
          <LoadError text="Nu am putut încărca rețetele. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
        ) : recipes && recipes.length === 0 ? (
          <Link to="/retete/noua" className="home-empty">Nicio rețetă încă. <b>Adaugă prima rețetă</b></Link>
        ) : (
          <div className="home-recipes">
            {recent.map((r) => (
              <Link key={r.id} to={`/retete/${r.id}`} className="home-recipe">
                <span className="home-recipe-img"><Thumb r={r} /></span>
                <span>{r.title}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!evening && night}
    </div>
  )
}
