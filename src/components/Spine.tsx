import type { ReactNode } from 'react'
import type { Story } from '../lib/types'
import { NATIVE_SWITCH, tickAllowed } from '../lib/shelf'
import { coverColor, getPosition } from '../lib/stories'

/** A small square of the cover picture (or the emoji on its colour while there is none). */
export function CoverPicture({ story, url, className }: { story: Pick<Story, 'title' | 'emoji'>; url?: string; className: string }) {
  return (
    <span className={className} style={{ background: coverColor(story.title) }} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <span>{story.emoji}</span>}
    </span>
  )
}

/**
 * What is printed on a spine: a bit of the cover, the title from top to bottom, a heart for a
 * favourite and the length. A ribbon hangs from the top of the book you were listening to.
 */
export function SpineFace({ story, url }: { story: Story; url?: string }) {
  const min = story.durationSec ? Math.max(1, Math.round(story.durationSec / 60)) : undefined
  return (
    <>
      {getPosition(story.id) > 5 && <span className="spine-ribbon" aria-hidden="true" />}
      <CoverPicture story={story} url={url} className="spine-cap" />
      <span className="spine-band" aria-hidden="true" />
      <span className="spine-title">{story.title}</span>
      {story.favorite && (
        <svg className="spine-heart" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" fill="currentColor" /></svg>
      )}
      {min && <span className="spine-min">{min}′</span>}
    </>
  )
}

/** What both bookshelf views get from the folder page. */
export interface BookViewProps {
  /** The folder's stories in shelf order, including the ones still waiting to be put on the shelf. */
  items: Story[]
  selId?: string
  onSelect: (id: string) => void
  onOpen: (s: Story) => void
  /** Stories new to this device, put on the shelf one after another with an animation. */
  arriving: string[]
  onArrived: (id: string) => void
  /** Phone turned sideways: the shelf fills the screen. */
  wide: boolean
}

/**
 * A button that is the label of a hidden native switch, so a real tap on it flips the switch and
 * an iPhone ticks (see NATIVE_SWITCH). Enter and Space work like on a button.
 */
export function TickButton({ className, label, disabled, onPress, children }: { className: string; label: string; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <label className={className} role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return // the switch's own click, passed up
        if (disabled || !tickAllowed()) e.preventDefault()
        if (!disabled) onPress()
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onPress() } }}>
      {children}
      <input {...NATIVE_SWITCH} disabled={disabled} />
    </label>
  )
}
