import { useState } from 'react'
import { checkColourful, knownColourful, useGlowStory } from '../lib/glow'
import { useNowPlaying } from '../lib/nowPlaying'
import CoverScene from './CoverScene'
import { useCoverUrl } from '../lib/useCoverUrl'
import { useFileUrl } from '../lib/useFileUrl'

/**
 * Behind every screen (design "Seară de lux"): the cover of the story in focus, blurred into a soft glow at the
 * top that fades into the dark background (full height on the player). A story without a picture
 * glows from its illustrated cover (sky, hills and emoji), blurred just like a picture; a black-and-white drawing, or nothing in focus, gets the warm default.
 * A new cover fades in over the old one once it has loaded.
 */
export default function CoverGlow({ recipes }: { recipes?: boolean }) {
  const chosen = useGlowStory()
  const playing = useNowPlaying().story
  // Recipes: only the dish a screen chose (no photo: the warm default), never the story playing.
  const story = recipes ? chosen : chosen ?? playing
  const cover = useCoverUrl(recipes ? undefined : story?.coverKey)
  const photo = useFileUrl(story && 'photoKey' in story ? story.photoKey : undefined)
  const url = photo ?? cover
  // The last picture that loaded and is colourful: stays underneath while the next one loads.
  const [shown, setShown] = useState<string>()
  const [, redraw] = useState(0)
  const ok = url ? knownColourful(url) : undefined
  const picture = url && ok !== false ? url : undefined
  const scene = story && !recipes && !story.coverKey ? story : undefined
  return (
    <div className="cover-glow" aria-hidden="true">
      {scene && (
        <span key={scene.id} className="glow-scene">
          <CoverScene title={scene.title} scene={'scene' in scene ? scene.scene : undefined} />
          {'emoji' in scene && scene.emoji && <span>{scene.emoji}</span>}
        </span>
      )}
      {shown && shown !== picture && picture && <img key={shown} src={shown} alt="" className="on" />}
      {picture && (
        <img key={picture} src={picture} alt="" className={shown === picture ? 'on' : undefined}
          onLoad={(e) => {
            // Dish photos are always in colour (and their signed URLs can't be read by a canvas).
            const good = recipes || (ok ?? checkColourful(picture, e.currentTarget))
            if (good) setShown(picture)
            else redraw((n) => n + 1)
          }} />
      )}
      <span className="glow-fade" />
    </div>
  )
}
