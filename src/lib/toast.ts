/**
 * One short message at the bottom of the screen, optionally with an undo button (like iOS /
 * Android apps), or another action. A sticky toast stays until it is used or replaced.
 */
export type ToastAction = { label: string; run: () => void }
export type Toast = { id: number; text: string; undo?: () => void; action?: ToastAction; sticky?: boolean }

let current: Toast | undefined
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function showToast(text: string, undo?: () => void, more?: { action?: ToastAction; sticky?: boolean }) {
  current = { id: nextId++, text, undo, ...more }
  emit()
}

export const hideToast = (id: number) => { if (current?.id === id) { current = undefined; emit() } }
export const subscribeToast = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const currentToast = () => current
