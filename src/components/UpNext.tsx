import { useCallback, useState } from 'react'
import { useNowPlaying, type NowPlaying } from '../lib/nowPlaying'
import { useKid } from '../lib/kidMode'
import { showToast } from '../lib/toast'
import { KID_LIMIT, kidCount, placeOf, queueMessage, untilStop } from '../lib/upNext'
import type { Story } from '../lib/types'
import PopMenu, { MenuRow } from './PopMenu'
import Sheet from './Sheet'
import StoryCover from './StoryCover'

// "Urmează" (the story queue) on the web: the ⋯ menu on a story, the line and the list in the
// player, the queue card on Acasă and the child's "Acum sau După?". Same rules as the iOS app.

const ICON = {
  first: 'M4 6h10M4 12h10M4 18h6M17 15l4-3-4-3z',
  last: 'M4 6h16M4 12h16M4 18h8M15 18h6M18 15v6',
  play: 'M7 4.5v15l12.5-7.5z',
}
const DOTS = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>

/** "Redă următoarea" and "Adaugă la coadă" for one story (in kid mode only "Adaugă la coadă"). */
function QueueRows({ story, done }: { story: Story; done: () => void }) {
  const player = useNowPlaying()
  const kid = useKid().active
  const tell = (r: Parameters<typeof queueMessage>[0]) => { showToast(queueMessage(r, !!player.story)); done() }
  if (player.story?.id === story.id) return <MenuRow>Se ascultă acum</MenuRow>
  return (
    <>
      {!kid && <MenuRow icon={ICON.first} onClick={() => tell(player.playNext(story))}>Redă următoarea</MenuRow>}
      <MenuRow icon={ICON.last} onClick={() => tell(player.addToQueue(story, kid))}>Adaugă la coadă</MenuRow>
    </>
  )
}

/** The ⋯ button on a story (long press is unreliable in Safari, so the web has a button). */
export function QueueMenuButton({ story, className }: { story: Story; className?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <span className={`menu-anchor queue-anchor${className ? ` ${className}` : ''}`}>
      <button type="button" className="queue-dots" aria-label={`Mai multe pentru „${story.title}”`} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}>{DOTS}</button>
      {open && <PopMenu label={`Coada pentru „${story.title}”`} onClose={close}><QueueRows story={story} done={close} /></PopMenu>}
    </span>
  )
}

/** A small gold number on a cover waiting in "Urmează". */
export function QueueBadge({ id }: { id: string }) {
  const { upNext } = useNowPlaying()
  const n = placeOf(upNext, id)
  return n ? <span className="queue-badge" aria-label={`În coadă, a ${n}-a`}>{n}</span> : null
}

const caption = (p: NowPlaying) => {
  if (!p.next) return 'Urmează'
  if (p.nextOrigin !== 'queue') return 'Urmează · din folder'
  return p.queued[0]?.byKid ? 'Urmează · ales de copil' : 'Urmează · ales de tine'
}

/** The line under the player's buttons: what plays next. Tap it for the whole list. */
export function UpNextLine() {
  const player = useNowPlaying()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const next = player.next
  return (
    <>
      <button type="button" className="upnext-line" onClick={() => setOpen(true)} aria-label={next ? `Urmează: ${next.title}. Deschide lista.` : 'Nu urmează nicio poveste. Deschide lista.'}>
        {next ? <StoryCover story={next} /> : <span className="upnext-moon" aria-hidden="true">☾</span>}
        <span className="upnext-text"><small>{caption(player)}</small><b>{next?.title ?? 'Nimic după povestea asta'}</b></span>
        {player.queued.length > 0 && <span className="queue-count">≡ {player.queued.length}</span>}
      </button>
      {open && <UpNextSheet onClose={close} />}
    </>
  )
}

/** "Urmează": the story playing, the chosen ones (move up / down, take out), then the folder's. */
export function UpNextSheet({ onClose }: { onClose: () => void }) {
  const p = useNowPlaying()
  const kid = useKid().active
  const n = untilStop(p.sleep, p.playedInRun)
  const upcoming = [...p.queued.map((q) => q.story), ...p.folderUpcoming]
  const stopId = n > 0 && n <= upcoming.length ? upcoming[n - 1].id : undefined
  // Positions in the saved list (it may hold stories not shown here), for moving.
  const indexOf = (id: string) => p.upNext.findIndex((q) => q.id === id)
  const left = Math.max(0, KID_LIMIT - kidCount(p.upNext))
  return (
    <Sheet title="Urmează" onClose={onClose} grab>
      <div className="upnext">
        {p.story && (
          <div className="upnext-row now">
            <StoryCover story={p.story} />
            <span className="upnext-text"><b>{p.story.title}</b><small>acum</small></span>
            {n === 0 && <span className="upnext-moon" title="Aici se oprește" aria-label="Aici se oprește">☾</span>}
          </div>
        )}
        {n === 0 && <p className="upnext-note">Se oprește după povestea asta (După {p.sleep === 1 ? '1 poveste' : `${p.sleep} povești`}).</p>}
        <div className="upnext-head">
          <h3>{kid ? 'Alese' : 'Alese de tine'}</h3>
          {!kid && p.queued.length > 0 && <button type="button" className="link-btn" onClick={p.clearQueue}>Golește</button>}
        </div>
        {!p.queued.length && <p className="upnext-note">Apasă ⋯ pe o poveste și alege „Adaugă la coadă”.</p>}
        <ol className="upnext-list">
          {p.queued.map(({ story, byKid }, i) => (
            <li key={story.id} className="upnext-row">
              <button type="button" className="upnext-play" onClick={() => { p.load(story, { autoplay: true, origin: 'queue' }) }} aria-label={`Ascultă acum „${story.title}”`}>
                <StoryCover story={story} />
                <span className="upnext-text"><b>{story.title}</b><small>{[byKid && 'ales de copil', story.durationSec && `${Math.max(1, Math.round(story.durationSec / 60))} min`].filter(Boolean).join(' · ')}</small></span>
              </button>
              {stopId === story.id && <span className="upnext-moon" aria-label="Aici se oprește">☾</span>}
              {!kid && (
                <>
                  <button type="button" className="upnext-btn" disabled={i === 0} aria-label={`Mută „${story.title}” mai sus`} onClick={() => p.moveInQueue(indexOf(story.id), indexOf(p.queued[i - 1].story.id))}>↑</button>
                  <button type="button" className="upnext-btn" disabled={i === p.queued.length - 1} aria-label={`Mută „${story.title}” mai jos`} onClick={() => p.moveInQueue(indexOf(story.id), indexOf(p.queued[i + 1].story.id))}>↓</button>
                </>
              )}
              {(!kid || byKid) && <button type="button" className="upnext-btn" aria-label={`Scoate „${story.title}” din coadă`} onClick={() => p.removeFromQueue(story.id)}>✕</button>}
            </li>
          ))}
        </ol>
        {kid && <p className="upnext-note">{left === 0 ? 'Ai ales toate poveștile pentru acum.' : left === 1 ? 'Mai poți alege o poveste.' : `Mai poți alege ${left} povești.`}</p>}
        {p.folderUpcoming.length > 0 && (
          <>
            <div className="upnext-head"><h3>{p.shuffle ? 'Apoi, amestecat' : 'Apoi, din folder'}</h3></div>
            <ol className="upnext-list dim">
              {p.folderUpcoming.map((story) => (
                <li key={story.id} className="upnext-row">
                  <StoryCover story={story} />
                  <span className="upnext-text"><b>{story.title}</b></span>
                  {stopId === story.id && <span className="upnext-moon" aria-label="Aici se oprește">☾</span>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** On Acasă while nothing plays: the stories waiting in "Urmează", ready for bedtime. */
export function QueueHomeCard({ onPlay }: { onPlay: (s: Story) => void }) {
  const p = useNowPlaying()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const list = p.queued.map((q) => q.story)
  if (p.story || !list.length) return null
  const min = Math.round(list.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60)
  return (
    <div className="queue-home">
      <button type="button" className="queue-home-open" onClick={() => setOpen(true)}>
        <StoryCover story={list[0]} />
        <span className="upnext-text">
          <small>Coada ta · {list.length === 1 ? '1 poveste' : `${list.length} povești`}{min > 0 ? ` · ${min} min` : ''}</small>
          <b>{list.slice(0, 3).map((s) => s.title).join(', ')}{list.length > 3 ? '…' : ''}</b>
        </span>
      </button>
      <button type="button" className="queue-home-play" aria-label="Pornește coada" onClick={() => onPlay(list[0])}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON.play} /></svg>
      </button>
      {open && <UpNextSheet onClose={close} />}
    </div>
  )
}

/** Kid mode, on the page of a story tapped while another plays: "Acum sau După?". */
export function KidQueueAsk({ story, onNow, onLater }: { story: Story; onNow: () => void; onLater: () => void }) {
  const { upNext } = useNowPlaying()
  const full = kidCount(upNext) >= KID_LIMIT
  return (
    <div className="kid-ask" role="dialog" aria-modal="true" aria-label="Când o asculți?">
      <div className="kid-ask-card">
        <StoryCover story={story} />
        <b>{story.title}</b>
        <span>Când o asculți?</span>
        <div className="kid-ask-btns">
          <button type="button" className="kid-now" onClick={onNow}><span aria-hidden="true">▶</span>Acum</button>
          <button type="button" className="kid-later" disabled={full} onClick={onLater}><span aria-hidden="true">☾</span>După</button>
        </div>
      </div>
    </div>
  )
}
