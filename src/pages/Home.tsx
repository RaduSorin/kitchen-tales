import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes, listStories, watchRecipes, watchStories } from '../lib/db'
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
import Vitrine, { type VitrineSlide } from '../components/Vitrine'
import MonthCard from '../components/MonthCard'
import HomeTabs from '../components/HomeTabs'
import { useSyncedList } from '../lib/synced'
import { dayKey, mondayOf, planStore, today, weekDays } from '../lib/plan'
import { LoadError, Loading } from '../components/LoadState'

// The recipes Acasă, design A1 "Topit în poză": the dish photo fills most of the screen (swipe
// between the dish you're cooking, today's plan and the newest recipe) and fades into the page,
// where three tabs hold the rest: Azi (today's menu, tonight's story, Răgaz), Săptămâna (seven
// round plates) and Caiet (recent recipes and one collection card per category).

const Play = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
)

function Thumb({ r }: { r: Recipe }) {
  const img = useFileUrl(r.photoKey)
  return img ? <img src={img} alt="" /> : <PlatePlaceholder seed={r.title} />
}

const meta = (r: Recipe) => [r.minutes && formatMinutes(r.minutes), r.category].filter(Boolean).join(' · ')
const WEEK_DAYS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D']
const NEW_DAYS = 7
const isNew = (r: Recipe) => !!r.createdAt && Date.now() - Date.parse(r.createdAt) < NEW_DAYS * 86400000

type Slide = { r: Recipe; kicker: string; action: string; to: string }

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
      <span className="ra-story-play" aria-hidden="true"><Play size={15} /></span>
    </Link>
  )
}

const Chevron = () => (
  <svg className="home-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
)

const Sec = ({ title, link, to }: { title: string; link: string; to: string }) => (
  <div className="sh-sec-head vt-sec"><h2>{title}</h2><Link to={to}>{link}</Link></div>
)

/** A category as a collection card: tinted from its first photo, three dishes overlapping on the right. */
function Category({ name, items }: { name: string; items: Recipe[] }) {
  const art = [...items.filter((r) => r.photoKey), ...items.filter((r) => !r.photoKey)].slice(0, 3)
  const fresh = items.filter(isNew).length
  return (
    <Link to={`/retete?cat=${encodeURIComponent(name)}`} className="collection vt-coll">
      <span className="vt-coll-tint" aria-hidden="true"><Thumb r={art[0]} /></span>
      <span className="collection-text">
        <span className="cover-title">{name}</span>
        <small className="cover-meta">{items.length} {items.length === 1 ? 'rețetă' : 'rețete'}{fresh > 0 && ` · ${fresh} ${fresh === 1 ? 'nouă' : 'noi'}`}</small>
      </span>
      <span className="vt-coll-stack" aria-hidden="true">
        {art.map((r, i) => <span key={r.id} style={{ zIndex: 3 - i }}><Thumb r={r} /></span>)}
      </span>
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
  // This device's lists at once, then the server's when it answers (a weak signal doesn't hold the page).
  useEffect(() => {
    const stopRecipes = watchRecipes(setRecipes, () => setFailed(true))
    const stopStories = watchStories(setStories)
    return () => { stopRecipes(); stopStories() }
  }, [])

  // Evening as soon as the sun starts going down, like the stories side.
  const evening = useSkyPhase() !== 'day'
  const lastCook = getLastCook()
  const cooking = lastCook && recipes?.find((r) => r.id === lastCook.id)
  const plan = useSyncedList(planStore)
  const t = today()
  const todayKey = dayKey(t)
  const byId = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes])
  // What is cooked today (leftovers were cooked yesterday).
  const menu = plan.filter((e) => e.day === todayKey && !e.leftovers).map((e) => byId.get(e.recipeId)).filter((r): r is Recipe => !!r)
  const newest = (recipes ?? []).reduce<Recipe | undefined>((a, r) => (!a || (r.createdAt ?? '') > (a.createdAt ?? '') ? r : a), undefined)

  // The photos on top: the dish you're cooking, today's first planned dish, the newest recipe.
  const slides: Slide[] = []
  const add = (s: Slide | false | undefined) => { if (s && !slides.some((x) => x.r.id === s.r.id)) slides.push(s) }
  add(cooking && { r: cooking, kicker: `Continuă · pasul ${lastCook.step + 1}`, action: 'Continuă', to: `/retete/${cooking.id}/gateste` })
  add(menu[0] && { r: menu[0], kicker: ['Azi în plan', menu[0].minutes && formatMinutes(menu[0].minutes)].filter(Boolean).join(' · '), action: 'Gătește pas cu pas', to: `/retete/${menu[0].id}/gateste` })
  add(newest && { r: newest, kicker: ['Adăugată recent', newest.minutes && formatMinutes(newest.minutes)].filter(Boolean).join(' · '), action: 'Gătește pas cu pas', to: `/retete/${newest.id}/gateste` })
  // Only one so far: fill up with the recipes changed last, so there is always something to swipe to.
  for (const r of recipes ?? []) {
    if (slides.length >= 3) break
    add({ r, kicker: ['Din caietul tău', r.minutes && formatMinutes(r.minutes)].filter(Boolean).join(' · '), action: 'Gătește pas cu pas', to: `/retete/${r.id}/gateste` })
  }
  // Which photo is on screen, for this set of dishes (a new set starts again from the first).
  const slideKey = slides.map((s) => s.r.id).join()
  const [pos, setPos] = useState({ key: '', i: 0 })
  const active = pos.key === slideKey ? pos.i : 0
  const setActive = (i: number) => setPos({ key: slideKey, i })
  const shown = slides[Math.min(active, slides.length - 1)]
  // The page glows in the colours of the dish on screen.
  useGlow(shown && { id: shown.r.id, title: shown.r.title, photoKey: shown.r.photoKey })

  const onTop = new Set(slides.map((s) => s.r.id))
  const restOfMenu = menu.filter((r) => !onTop.has(r.id))
  const recent = (recipes ?? []).filter((r) => !onTop.has(r.id)).slice(0, 8)
  const week = weekDays(mondayOf(t)).map((d) => {
    const key = dayKey(d)
    const first = plan.find((e) => e.day === key && byId.has(e.recipeId))
    return { key, d, r: first && byId.get(first.recipeId) }
  })
  const categories = useMemo(() => {
    const m = new Map<string, Recipe[]>()
    for (const r of recipes ?? []) if (r.category) m.set(r.category, [...(m.get(r.category) ?? []), r])
    return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ro'))
  }, [recipes])
  const playable = stories && (online ? stories : stories.filter((s) => offline.has(s.id)))

  if (!recipes || !slides.length) {
    return (
      <div className="home">
        <HomeHead search="/cauta" label="Caută rețete, ingrediente sau povești" field="search-input" />
        <h1 className="sa-greeting">Ce gătim azi?</h1>
        <MonthCard />
        {failed && !recipes ? (
          <LoadError text="Nu am putut încărca rețetele. Verifică internetul." onRetry={() => { setFailed(false); load() }} />
        ) : !recipes ? <Loading /> : (
          <Link to="/retete/noua" className="home-empty">Nicio rețetă încă. <b>Adaugă prima rețetă</b></Link>
        )}
        {playable && <StoryCard key={playable.length} stories={playable} evening={evening} />}
      </div>
    )
  }

  return (
    <div className="home vitrina">
      <h1 className="sr-only">Ce gătim azi?</h1>
      {/* New dishes on top (the plan or the recipes arriving): start again from the first one. */}
      <Vitrine key={slideKey} label="De gătit" active={Math.min(active, slides.length - 1)} onActive={setActive}
        head={<HomeHead search="/cauta" label="Caută rețete, ingrediente sau povești" field="search-input" />}
        slides={slides.map((x): VitrineSlide => ({
          id: x.r.id, art: <Thumb r={x.r} />, kicker: x.kicker, title: x.r.title, href: `/retete/${x.r.id}`,
          meta: [x.r.category, x.r.servings && `${x.r.servings} porții`].filter(Boolean).join(' · ') || undefined,
          action: x.action, actionTo: x.to, side: <Link to={`/retete/${x.r.id}`} className="vt-ghost">Rețeta</Link>,
        }))} />

      <HomeTabs memory="kt-home-tab" label="Acasă" tabs={[
        { key: 'azi', label: 'Azi', body: <>
          {restOfMenu.length > 0 ? (
            <ul className="home-rows">
              {restOfMenu.map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link to={`/retete/${r.id}`}>
                    <span className="home-row-img"><Thumb r={r} /></span>
                    <span className="home-row-text"><b>{r.title}</b>{meta(r) && <small>Azi în meniu · {meta(r)}</small>}</span>
                    <Chevron />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Link to="/saptamana" className="home-note">{menu.length ? 'Atât e azi în meniu.' : 'Nimic în plan azi.'} <b>Săptămâna</b></Link>
          )}
          {playable && <StoryCard key={playable.length} stories={playable} evening={evening} />}
          <MonthCard />
        </> },
        { key: 'saptamana', label: 'Săptămâna', body: <>
          <div className="vt-week">
            {week.map(({ key, d, r }, i) => {
              const isToday = key === todayKey
              const name = d.toLocaleDateString('ro-RO', { weekday: 'long' })
              return (
                <Link key={key} to={`/saptamana?zi=${key}`} className={isToday ? 'vt-day today' : 'vt-day'}
                  aria-label={r ? `${name}: ${r.title}` : `${name}: nimic planificat`}>
                  <span className={r ? 'vt-plate' : 'vt-plate free'}>{r ? <Thumb r={r} /> : '+'}</span>
                  <small>{isToday ? 'Azi' : WEEK_DAYS[i]}</small>
                </Link>
              )
            })}
          </div>
          <div className="home-links"><Link to="/saptamana">Toată săptămâna</Link><Link to="/saptamana/planifica">Planifică</Link></div>
        </> },
        { key: 'caiet', label: 'Caiet', body: <>
          {recent.length > 0 && (
            <section className="home-sec">
              <Sec title="Recente" link="Toate" to="/retete" />
              <div className="vt-scroll" key={recent.map((r) => r.id).join()}>
                {recent.map((r) => (
                  <Link key={r.id} to={`/retete/${r.id}`} className="vt-tall">
                    <span className="vt-img"><Thumb r={r} /></span>
                    <b>{r.title}</b>{meta(r) && <small>{meta(r)}</small>}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {categories.length > 0 && (
            <section className="home-sec">
              <Sec title="Caietul meu" link="Toate" to="/retete" />
              <div className="collections">{categories.map(([name, items]) => <Category key={name} name={name} items={items} />)}</div>
            </section>
          )}
          {!recent.length && !categories.length && <Link to="/retete" className="home-note">Toate rețetele <b>Rețete</b></Link>}
        </> },
      ]} />
    </div>
  )
}
