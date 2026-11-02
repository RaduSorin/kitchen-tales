import { defineFunction } from '@aws-amplify/backend'

// Lists the family accounts and invites new ones (Cognito AdminCreateUser).
// Lives in the auth stack because it needs the user pool.
export const family = defineFunction({
  name: 'family',
  entry: './handler.ts',
  timeoutSeconds: 20,
  resourceGroupName: 'auth',
})
