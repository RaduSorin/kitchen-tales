import { useState } from 'react'
import { checkColourful, knownColourful, useGlowStory } from '../lib/glow'
import { useNowPlaying } from '../lib/nowPlaying'
import { coverColor } from '../lib/stories'
import { useCoverUrl } from '../lib/useCoverUrl'

/**
 * Behind every stories screen: the cover of the story in focus, blurred into a soft glow at the
 * top that fades into the dark background (full height on the player). A story without a picture
 * glows in its tile colour; a black-and-white drawing, or nothing in focus, gets the warm default.
 * A new cover fades in over the old one once it has loaded.
 */
export default function CoverGlow() {
  const chosen = useGlowStory()
  const playing = useNowPlaying().story
  const story = chosen ?? playing
  const url = useCoverUrl(story?.coverKey)
  // The last picture that loaded and is colourful: stays underneath while the next one loads.
  const [shown, setShown] = useState<string>()
  const [, redraw] = useState(0)
  const ok = url ? knownColourful(url) : undefined
  const picture = url && ok !== false ? url : undefined
  const tint = story && !story.coverKey ? coverColor(story.title) : undefined
  return (
    <div className="cover-glow" aria-hidden="true">
      {tint && <span className="glow-tint" style={{ ['--glow' as string]: tint }} />}
      {shown && shown !== picture && picture && <img key={shown} src={shown} alt="" className="on" />}
      {picture && (
        <img key={picture} src={picture} alt="" className={shown === picture ? 'on' : undefined}
          onLoad={(e) => {
            const good = ok ?? checkColourful(picture, e.currentTarget)
            if (good) setShown(picture)
            else redraw((n) => n + 1)
          }} />
      )}
      <span className="glow-fade" />
    </div>
  )
}
