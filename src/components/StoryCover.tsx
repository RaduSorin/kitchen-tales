import { useState } from 'react'
import type { Story } from '../lib/types'
import { COVER_IMG_BG, coverColor } from '../lib/stories'
import CoverScene from './CoverScene'
import { useCoverUrl } from '../lib/useCoverUrl'

// Round-cornered tile with the story's picture; `round` makes it a circle for the player.
// Without a picture (or while it loads, or if it fails) it is an illustrated cover: a sky with
// stars and hills in the story's colours, the emoji, and on big covers the title.
// Once the picture has loaded the emoji is removed and the tile turns neutral, so a transparent
// PNG doesn't show the emoji through it.
export default function StoryCover({ story, round, className, src }: {
  story: Pick<Story, 'title' | 'emoji' | 'coverKey' | 'scene'>
  round?: boolean
  className?: string
  /** A local preview (e.g. while adding a story) instead of the saved cover. */
  src?: string
}) {
  const saved = useCoverUrl(src ? undefined : story.coverKey)
  const url = src ?? saved
  const [loaded, setLoaded] = useState<string>()
  const [failed, setFailed] = useState<string>()
  const shown = !!url && loaded === url
  return (
    <span className={`story-cover${round ? ' round' : ''}${shown ? ' has-img' : ''}${className ? ` ${className}` : ''}`} style={{ background: shown ? COVER_IMG_BG : coverColor(story.title, story.scene) }} aria-hidden="true">
      {!shown && <CoverScene title={story.title} scene={story.scene} />}
      {!shown && <span>{story.emoji}</span>}
      {!shown && <b className="cover-name">{story.title}</b>}
      {url && failed !== url && (
        <img src={url} alt="" style={shown ? undefined : { opacity: 0 }} onLoad={() => setLoaded(url)} onError={() => setFailed(url)} />
      )}
    </span>
  )
}
