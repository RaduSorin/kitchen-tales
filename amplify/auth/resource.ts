import { defineAuth } from '@aws-amplify/backend'

// Email login. Self sign-up is disabled in backend.ts: accounts are created
// by the owner (family only), so "authenticated" means "family member".
export const auth = defineAuth({
  loginWith: { email: true },
})
