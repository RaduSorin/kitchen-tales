import { SCENES, sceneIndex } from '../lib/stories'
import CoverScene from './CoverScene'

/** The emojis a drawn cover can have. */
export const COVER_EMOJIS = ['🐻', '🦊', '🐰', '🦁', '🐉', '🧚', '👑', '🚀', '🌙', '⭐', '🐢', '🦄']

/**
 * The drawn cover's choices: the emoji, then the colours as mini covers (sky, stars, hills and
 * the emoji) in each palette. Used when adding a story and from the player's ⋯ menu.
 */
export default function CoverDrawing({ title, emoji, scene, onEmoji, onScene }: {
  title: string; emoji: string; scene?: number; onEmoji: (e: string) => void; onScene: (i: number) => void
}) {
  const current = scene ?? sceneIndex(title || 'Poveste')
  const emojis = COVER_EMOJIS.includes(emoji) ? COVER_EMOJIS : [emoji, ...COVER_EMOJIS.slice(0, -1)]
  return (
    <>
      <div className="emoji-pick fin-emoji" role="group" aria-label="Desenul de pe copertă">
        {emojis.map((x) => <button type="button" key={x} className={x === emoji ? 'on' : ''} aria-pressed={x === emoji} onClick={() => onEmoji(x)}>{x}</button>)}
      </div>
      <div className="fin-scenes" role="radiogroup" aria-label="Culorile copertei">
        {SCENES.map((_, i) => (
          <button type="button" key={i} role="radio" aria-checked={current === i} aria-label={`Culorile ${i + 1}`} className={current === i ? 'on' : undefined} onClick={() => onScene(i)}>
            <CoverScene title="" scene={i} />
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
    </>
  )
}
