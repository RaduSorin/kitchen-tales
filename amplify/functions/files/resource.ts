import { defineFunction } from '@aws-amplify/backend'

// The only way the app reaches stored files (photos, story audio, covers): it checks that the
// caller's space may read or delete each one, then hands out short-lived signed links.
// Lives in the data stack because it reads the Story and Recipe tables (see backend.ts).
export const files = defineFunction({
  name: 'files',
  entry: './handler.ts',
  timeoutSeconds: 15,
  resourceGroupName: 'data',
})
