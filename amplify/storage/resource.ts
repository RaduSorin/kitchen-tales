import { defineStorage } from '@aws-amplify/backend'

// S3 bucket for recipe photos and story audio, private to signed-in family members.
export const storage = defineStorage({
  name: 'kitchenTalesFiles',
  access: (allow) => ({
    'recipe-photos/*': [allow.authenticated.to(['read', 'write', 'delete'])],
    'stories/*': [allow.authenticated.to(['read', 'write', 'delete'])],
  }),
})
