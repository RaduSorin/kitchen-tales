import { defineAuth } from '@aws-amplify/backend'
import { family } from '../functions/family/resource'

// Email login. Self sign-up is disabled in backend.ts: accounts are created
// by family members from the Family screen, so "authenticated" means "family member".
export const auth = defineAuth({
  loginWith: { email: true },
  // The Family screen in Settings lists accounts and sends invitations.
  access: (allow) => [allow.resource(family).to(['listUsers', 'createUser'])],
})
