import { defineStorage } from '@aws-amplify/backend'
import { importRecipe } from '../functions/import-recipe/resource'
import { generateStory } from '../functions/generate-story/resource'
import { findCover } from '../functions/find-cover/resource'

// S3 bucket for recipe photos, story audio and covers. Signed-in accounts get no direct access:
// they read, upload and delete through the files function (functions/files, granted in
// backend.ts), which checks the caller's space, so a separate account only reaches what is
// shared with it. New files sit in a folder per space (see amplify/shared/files.ts).
export const storage = defineStorage({
  name: 'kitchenTalesFiles',
  access: (allow) => ({
    'recipe-photos/*': [allow.resource(importRecipe).to(['read', 'write'])],
    'stories/*': [allow.resource(generateStory).to(['write'])],
    'story-covers/*': [allow.resource(findCover).to(['write'])],
    // The outcome of long AI work, written in the background (see amplify/shared/jobs.ts).
    'ai-jobs/*': [allow.resource(importRecipe).to(['write']), allow.resource(generateStory).to(['write'])],
    // Each space's monthly count of paid AI work (see amplify/shared/aiUsage.ts).
    'ai-usage/*': [allow.resource(importRecipe).to(['read', 'write']), allow.resource(generateStory).to(['read', 'write'])],
  }),
})
