import { a, defineData, type ClientSchema } from '@aws-amplify/backend'
import { importRecipe } from '../functions/import-recipe/resource'

// Every signed-in family member can read and edit everything.
const schema = a.schema({
  Recipe: a
    .model({
      title: a.string().required(),
      category: a.string(),
      servings: a.integer(),
      minutes: a.integer(),
      ingredients: a.string().array(),
      steps: a.string().array(),
      notes: a.string(),
      sourceUrl: a.string(),
      photoKey: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Story: a
    .model({
      title: a.string().required(),
      emoji: a.string(),
      source: a.enum(['upload', 'recording', 'generated']),
      audioKey: a.string().required(),
      durationSec: a.float(),
    })
    .authorization((allow) => [allow.authenticated()]),

  ImportedRecipe: a.customType({
    title: a.string().required(),
    category: a.string(),
    servings: a.integer(),
    minutes: a.integer(),
    ingredients: a.string().array().required(),
    steps: a.string().array().required(),
    notes: a.string(),
    sourceUrl: a.string(),
    photoKey: a.string(),
  }),

  // Reads a recipe from a web page link or from an uploaded photo.
  importRecipe: a
    .query()
    .arguments({ url: a.string(), photoKey: a.string() })
    .returns(a.ref('ImportedRecipe'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
})
