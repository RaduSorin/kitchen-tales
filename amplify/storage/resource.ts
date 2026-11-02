import { defineStorage } from '@aws-amplify/backend'
import { importRecipe } from '../functions/import-recipe/resource'
import { generateStory } from '../functions/generate-story/resource'
import { findCover } from '../functions/find-cover/resource'

// S3 bucket for recipe photos and story audio, private to signed-in family members.
export const storage = defineStorage({
  name: 'kitchenTalesFiles',
  access: (allow) => ({
    'recipe-photos/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.resource(importRecipe).to(['read', 'write']),
    ],
    'stories/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.resource(generateStory).to(['write']),
    ],
    'story-covers/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.resource(findCover).to(['write']),
    ],
  }),
})
