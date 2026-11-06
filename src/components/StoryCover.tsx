import { useState } from 'react'
import type { Story } from '../lib/types'
import { COVER_IMG_BG, coverColor } from '../lib/stories'
import { useCoverUrl } from '../lib/useCoverUrl'

// Round-cornered colored tile with the story's picture; `round` makes it a circle for the player.
// The emoji on its colour shows while there is no picture, while it loads, or if it fails.
// Once the picture has loaded the emoji is removed and the tile turns neutral, so a transparent
// PNG doesn't show the emoji through it.
export default function StoryCover({ story, round, className, src }: {
  story: Pick<Story, 'title' | 'emoji' | 'coverKey'>
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
    <span className={`story-cover${round ? ' round' : ''}${shown ? ' has-img' : ''}${className ? ` ${className}` : ''}`} style={{ background: shown ? COVER_IMG_BG : coverColor(story.title) }} aria-hidden="true">
      {!shown && <span>{story.emoji}</span>}
      {url && failed !== url && (
        <img src={url} alt="" style={shown ? undefined : { opacity: 0 }} onLoad={() => setLoaded(url)} onError={() => setFailed(url)} />
      )}
    </span>
  )
}
