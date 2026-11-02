import type { Story } from '../lib/types'
import { coverColor } from '../lib/stories'

// Round-cornered colored tile with the story's picture; `round` makes it a circle for the player.
export default function StoryCover({ story, round, className }: { story: Pick<Story, 'title' | 'emoji'>; round?: boolean; className?: string }) {
  return (
    <span className={`story-cover${round ? ' round' : ''}${className ? ` ${className}` : ''}`} style={{ background: coverColor(story.title) }} aria-hidden="true">
      <span>{story.emoji}</span>
    </span>
  )
}
