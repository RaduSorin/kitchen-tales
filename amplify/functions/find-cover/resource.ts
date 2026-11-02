import { defineFunction } from '@aws-amplify/backend'

// Finds cover pictures for a story by its title (iTunes catalog and Wikipedia),
// and copies the one a parent picks into the app's storage.
export const findCover = defineFunction({
  name: 'find-cover',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
})
