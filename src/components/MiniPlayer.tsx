import { Link, useLocation } from 'react-router-dom'
import { useNowPlaying } from '../lib/nowPlaying'
import StoryCover from './StoryCover'

/** A bar at the bottom of every other page while a story is loaded, so it can keep playing in the background. */
export default function MiniPlayer() {
  const { story, playing, t, dur, url, toggle, close } = useNowPlaying()
  const { pathname } = useLocation()
  if (!story || pathname === `/povesti/${story.id}`) return null
  return (
    <>
      <div className="mini-spacer" aria-hidden="true" />
      <div className="mini-player" role="region" aria-label="Povestea care rulează">
        <span className="mini-progress" style={{ width: dur ? `${(t / dur) * 100}%` : '0%' }} />
        <Link to={`/povesti/${story.id}`} className="mini-open">
          <StoryCover story={story} />
          <span className="mini-title">{story.title}</span>
        </Link>
        <button type="button" className="mini-btn mini-play" onClick={toggle} disabled={!url} aria-label={playing ? 'Pauză' : 'Pornește'}>
          {playing
            ? <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor" /></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>}
        </button>
        <button type="button" className="mini-btn" onClick={close} aria-label="Oprește povestea">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </>
  )
}
