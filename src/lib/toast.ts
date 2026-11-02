/** One short message at the bottom of the screen, optionally with an undo button (like iOS / Android apps). */
export type Toast = { id: number; text: string; undo?: () => void }

let current: Toast | undefined
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function showToast(text: string, undo?: () => void) {
  current = { id: nextId++, text, undo }
  emit()
}

export const hideToast = (id: number) => { if (current?.id === id) { current = undefined; emit() } }
export const subscribeToast = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const currentToast = () => current
