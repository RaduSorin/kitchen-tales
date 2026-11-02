import type { Story } from '../lib/types'
import { coverColor } from '../lib/stories'
import { useCoverUrl } from '../lib/useCoverUrl'

// Round-cornered colored tile with the story's picture; `round` makes it a circle for the player.
// Shows the cover image when there is one; the emoji stays underneath while it loads or if it fails.
export default function StoryCover({ story, round, className, src }: {
  story: Pick<Story, 'title' | 'emoji' | 'coverKey'>
  round?: boolean
  className?: string
  /** A local preview (e.g. while adding a story) instead of the saved cover. */
  src?: string
}) {
  const saved = useCoverUrl(src ? undefined : story.coverKey)
  const url = src ?? saved
  return (
    <span className={`story-cover${round ? ' round' : ''}${url ? ' has-img' : ''}${className ? ` ${className}` : ''}`} style={{ background: coverColor(story.title) }} aria-hidden="true">
      <span>{story.emoji}</span>
      {url && <img src={url} alt="" onError={(e) => { e.currentTarget.hidden = true }} />}
    </span>
  )
}
