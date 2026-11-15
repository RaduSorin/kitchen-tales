import { useRef, useSyncExternalStore } from 'react'
import type { Story } from './types'
import { type NowPlaying, useNowPlaying } from './nowPlaying'
import { queueMessage } from './upNext'
import { showToast } from './toast'

/*
 * How stories get into "Urmează" on the web without a button on every cover:
 * - a long press (or a right click) on a story opens one shared menu (QueueMenuHost);
 * - "Adaugă povești" in the Urmează list starts a picking mode: in the library, a tap on a cover
 *   adds it to the queue (or takes it out) instead of opening it, until "Gata".
 */

interface QueueUi { menu?: Story; picking: boolean }
let state: QueueUi = { picking: false }
const listeners = new Set<() => void>()
const set = (next: Partial<QueueUi>) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()) }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export const useQueueUi = () => useSyncExternalStore(subscribe, () => state)
export const openQueueMenu = (story: Story) => set({ menu: story })
export const closeQueueMenu = () => set({ menu: undefined })
export const startPicking = () => set({ picking: true, menu: undefined })
export const stopPicking = () => set({ picking: false })
export const isPicking = () => state.picking

/** Picking: a story goes into the queue, or comes out if it was already there. */
export function togglePicked(player: NowPlaying, story: Story) {
  if (player.upNext.some((q) => q.id === story.id)) { player.removeFromQueue(story.id); return }
  const r = player.addToQueue(story)
  if (r !== 'added') showToast(queueMessage(r, true))
}

/** How long a finger stays on a story before its menu opens (like iOS). */
const HOLD_MS = 500

/**
 * Long press and right click on a story: opens its queue menu. The click that ends a long press is
 * swallowed, so the story does not open as well. A finger that moves (a scroll) cancels the press.
 * While picking ("Adaugă povești"), a tap adds the story to the queue, or takes it out, instead.
 */
export function useQueuePress(story: Story) {
  const player = useNowPlaying()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number }>(undefined)
  const fired = useRef(false)
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined; start.current = undefined }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        fired.current = true
        start.current = undefined
        navigator.vibrate?.(10)
        openQueueMenu(story)
      }, HOLD_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      // Android fires this for a long press too: the menu is already open then.
      if (!fired.current) { fired.current = true; openQueueMenu(story) }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; return }
      if (state.picking) { e.preventDefault(); e.stopPropagation(); togglePicked(player, story) }
    },
  }
}
