import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cachedFolders, listFolders, listRecipes, listStories } from '../lib/db'
import type { Recipe, Story, StoryFolder } from '../lib/types'
import { useOfflineIds, useOnline } from '../lib/useOffline'
import { useSettings } from '../lib/settings'
import { fmtTime, folderOf, getLastStoryId, getPosition, greeting, groupFolders } from '../lib/stories'
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

/** Tonight's stories: a different set each day, starting with the story of the day, without the one to continue. */
function storiesOfTheDay(stories: Story[], day: number, skip?: string, n = 8) {
  const pool = stories.length > 1 ? stories.filter((s) => s.id !== skip) : stories
  if (!pool.length) return []
  const start = day % pool.length
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, n)
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
        <span className="sa-hero-btn"><Play /> Ascultă</span>
      </span>
    </Link>
  )
}

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

/** "Acasă" in the stories area: the story to continue, tonight's stories, the folders, and a peek at the kitchen. */
export default function StoriesHome() {
  const { child } = useSettings()
  const online = useOnline()
  const offline = useOfflineIds()
  const [stories, setStories] = useState<Story[]>()
  const [rows, setRows] = useState<StoryFolder[]>(cachedFolders)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const plan = useSyncedList(planStore)
  const [{ hour, day }] = useState(() => ({ hour: new Date().getHours(), day: Math.floor(Date.now() / 86400000) }))
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
  // No story to continue: the story of the day is the big card, the rest of the day's stories follow.
  const hero = continuing ?? tonight[0]
  const tonightRow = continuing ? tonight : tonight.slice(1)
  const folders = groupFolders(available, online && !kid ? rows : []).filter((f) => f.items.length > 0)
  const favorites = available.filter((s) => s.favorite).slice(0, 10)
  const recent = available.slice(0, 10) // the list comes newest first
  const todayKey = dayKey(today())
  const cooking = plan.filter((e) => e.day === todayKey).map((e) => recipes.find((r) => r.id === e.recipeId)).filter((r): r is Recipe => !!r)
  // The top of the screen glows in the colours of the big card's cover.
  useGlow(hero)
  const forChild = child.name ? ` pentru ${child.name}` : ''

  return (
    <section className="stories-home">
      <h1 className="sa-greeting">{evening && hour >= 12 ? 'Bună seara' : greeting()}{child.name ? `, ${child.name}` : ''}</h1>

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
          ) : hero && (
            <Hero story={hero} kicker={evening ? `Povestea de diseară${forChild}` : 'Povestea zilei'} note={hero.durationSec ? minutes(hero.durationSec) : undefined} />
          )}

          <Row title={evening ? 'Pentru diseară' : 'Pentru azi'} to="/povesti" stories={tonightRow} />

          {folders.length > 1 && (
            <section className="sh-sec">
              <div className="sh-sec-head"><h2>Colecții</h2></div>
              <div className="sa-chips">
                {folders.map((f) => (
                  <Link key={f.name} to={`/povesti?folder=${encodeURIComponent(f.name)}`} className="sa-chip">
                    {f.icon && <span aria-hidden="true">{f.icon}</span>}{f.name}
                  </Link>
                ))}
              </div>
            </section>
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
