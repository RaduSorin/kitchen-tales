/**
 * One short message at the bottom of the screen, optionally with a button (like iOS / Android
 * apps): "Anulează" by default, or `label` (e.g. "Deschide"); `ms` keeps it longer on screen.
 */
export type Toast = { id: number; text: string; undo?: () => void; label?: string; ms?: number }

let current: Toast | undefined
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function showToast(text: string, undo?: () => void, opts?: { label?: string; ms?: number }) {
  current = { id: nextId++, text, undo, ...opts }
  emit()
}

export const hideToast = (id: number) => { if (current?.id === id) { current = undefined; emit() } }
export const subscribeToast = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const currentToast = () => current
