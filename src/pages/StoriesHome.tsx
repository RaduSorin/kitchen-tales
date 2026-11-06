import { primeKeyboard } from '../lib/keyboard'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes, listStories } from '../lib/db'
import type { Recipe, Story } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, getLastStoryId, getPosition, greeting } from '../lib/stories'
import { useSyncedList } from '../lib/synced'
import { dayKey, planStore, today } from '../lib/plan'
import { useFileUrl } from '../lib/useFileUrl'
import StoryCover from '../components/StoryCover'
import PlatePlaceholder from '../components/PlatePlaceholder'
import { LoadError, Loading } from '../components/LoadState'
import { useGlow } from '../lib/glow'
import { useSkyPhase } from '../lib/sky'
import { useKid } from '../lib/kidMode'

const Play = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>

/** A different story each day, skipping the one you just heard. */
function storyOfTheDay(stories: Story[], day: number, skip?: string) {
  const pool = stories.length > 1 ? stories.filter((s) => s.id !== skip) : stories
  return pool.length ? pool[day % pool.length] : undefined
}

const minutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`

/** The big card at the top: a story to continue, or tonight's story. */
function Hero({ story, kicker, note, progress }: { story: Story; kicker: string; note?: string; progress?: number }) {
  return (
    <Link to={`/povesti/${story.id}`} className="sa-hero">
      <StoryCover story={story} />
      <span className="sa-hero-text">
        <small className="sa-kicker">{kicker}</small>
        <b>{story.title}</b>
        {note && <span className="sa-hero-note">{note}</span>}
        {progress !== undefined && <span className="sa-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>}
        <span className="sa-hero-btn"><Play /> Ascultă{progress === undefined && story.durationSec ? ` · ${minutes(story.durationSec)}` : ''}</span>
      </span>
    </Link>
  )
}

function Row({ title, to, stories, from }: { title: string; to: string; stories: Story[]; from?: 'favorites' }) {
  if (!stories.length) return null
  return (
    <section className="sh-sec">
      <div className="sh-sec-head"><h2>{title}</h2><Link to={to}>Toate</Link></div>
      <div className="sh-row">
        {stories.map((s) => (
          <Link key={s.id} to={`/povesti/${s.id}`} state={from ? { fromFolder: true, from } : { fromFolder: true }} className="cover-card sh-card">
            <span className="sa-cover">
              <StoryCover story={s} />
              {s.durationSec ? <span className="sa-dur">{minutes(s.durationSec)}</span> : null}
            </span>
            <span className="cover-title">{s.title}</span>
          </Link>
        ))}
      </div>
    </section>
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

/** "Acasă" in the stories area: mostly stories, with a small peek at what's cooking today. */
export default function StoriesHome() {
  const { child } = useSettings()
  const online = useOnline()
  const offline = useOfflineIds()
  const [stories, setStories] = useState<Story[]>()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const plan = useSyncedList(planStore)
  const [{ hour, day }] = useState(() => ({ hour: new Date().getHours(), day: Math.floor(Date.now() / 86400000) }))
  const sky = useSkyPhase()
  const kid = useKid().active
  const [failed, setFailed] = useState(false)
  const load = () => {
    listStories().then(setStories).catch(() => setFailed(true))
    listRecipes().then(setRecipes).catch(() => {})
  }
  useEffect(load, [])

  const available = (stories ?? []).filter((s) => online || offline.has(s.id))
  const last = available.find((s) => s.id === getLastStoryId())
  const lastPos = last ? getPosition(last.id) : 0
  const tonight = storyOfTheDay(available, day, last?.id)
  const favorites = available.filter((s) => s.favorite).slice(0, 10)
  const recent = available.slice(0, 10) // the list comes newest first
  const todayKey = dayKey(today())
  const cooking = plan.filter((e) => e.day === todayKey).map((e) => recipes.find((r) => r.id === e.recipeId)).filter((r): r is Recipe => !!r)
  // "Tonight" as soon as the sun starts going down (earlier in winter).
  const evening = sky !== 'day'
  const continuing = last && lastPos > 5 ? last : undefined
  // The top of the screen glows in the colours of the story you'd play next.
  useGlow(continuing ?? tonight)

  return (
    <section className="stories-home">
      <div className="shelf-head">
        <div>
          <h1>{evening && hour >= 12 ? 'Bună seara' : greeting()}{child.name ? `, ${child.name}` : ''}</h1>
          <p className="shelf-sub">{evening ? 'E vremea de o poveste.' : 'Ce poveste ascultăm?'}</p>
        </div>
      </div>
      <Link to="/povesti?cauta=1" className="search-box night-search search-link" onClick={() => primeKeyboard('story-search')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg><span>Caută o poveste</span>
      </Link>

      {failed && !stories ? <LoadError text="Nu am putut încărca poveștile. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
        : stories === undefined ? <Loading /> : !available.length ? kid ? <p className="empty">Nicio poveste aici încă.</p> : (
        <Link to="/povesti/adauga" className="continue sh-empty">
          <span className="continue-text"><b>Nicio poveste încă</b><small>Adaugă prima poveste: încarci, înregistrezi sau o creăm împreună</small></span>
          <span className="continue-play" aria-hidden="true">+</span>
        </Link>
      ) : (
        <>
          {continuing ? (
            <Hero story={continuing} kicker="Continuă"
              note={continuing.durationSec ? `mai sunt ${minutes(Math.max(0, continuing.durationSec - lastPos))}` : `de la ${fmtTime(lastPos)}`}
              progress={continuing.durationSec ? Math.min(1, lastPos / continuing.durationSec) : undefined} />
          ) : tonight && (
            <Hero story={tonight} kicker={evening ? `Povestea de diseară${child.name ? ` pentru ${child.name}` : ''}` : 'Povestea zilei'} />
          )}

          {continuing && tonight && (
            <Link to={`/povesti/${tonight.id}`} className="sh-tonight">
              <StoryCover story={tonight} />
              <span className="sh-tonight-text">
                <small>{evening ? `Povestea de diseară${child.name ? ` pentru ${child.name}` : ''}` : 'Povestea zilei'}</small>
                <b>{tonight.title}</b>
                <span className="sh-tonight-btn"><Play /> Ascultă{tonight.durationSec ? ` · ${minutes(tonight.durationSec)}` : ''}</span>
              </span>
            </Link>
          )}

          <Row title="Favorite" to="/povesti?favorite=1" stories={favorites} from="favorites" />
          <Row title="Adăugate recent" to="/povesti" stories={recent} />
        </>
      )}

      {!kid && <section className="sh-sec">
        <div className="sh-sec-head"><h2>Din bucătărie</h2><Link to="/saptamana">Săptămâna</Link></div>
        {cooking.length
          ? cooking.slice(0, 2).map((r) => <RecipePeek key={r.id} r={r} label="Azi în meniu" />)
          : recipes[0] ? <RecipePeek r={recipes[0]} label="Rețetă recentă" /> : <Link to="/retete" className="sh-recipe"><span className="sh-recipe-text"><b>Rețetele mele</b></span></Link>}
      </section>}
    </section>
  )
}
