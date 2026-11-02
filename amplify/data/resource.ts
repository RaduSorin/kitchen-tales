import { a, defineData, type ClientSchema } from '@aws-amplify/backend'
import { importRecipe } from '../functions/import-recipe/resource'
import { generateStory } from '../functions/generate-story/resource'
import { family } from '../functions/family/resource'

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
      // Optional photo per step, aligned with steps by index ('' = no photo).
      stepPhotoKeys: a.string().array(),
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
      text: a.string(),
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

  GeneratedStory: a.customType({
    text: a.string().required(),
    audioKey: a.string().required(),
  }),

  // Writes a story with AI (or uses the given text) and narrates it with Polly.
  generateStory: a
    .query()
    .arguments({
      title: a.string().required(),
      prompt: a.string(),
      childName: a.string(),
      gender: a.string(),
      age: a.integer(),
      length: a.string(),
      text: a.string(),
    })
    .returns(a.ref('GeneratedStory'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateStory)),

  FamilyMember: a.customType({
    email: a.string().required(),
    pending: a.boolean().required(),
    createdAt: a.string(),
  }),

  // Accounts that can sign in. Any family member can see them and invite more.
  listFamily: a
    .query()
    .returns(a.ref('FamilyMember').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(family)),

  // Creates an account and emails a temporary password (resend: true sends it again).
  inviteFamilyMember: a
    .mutation()
    .arguments({ email: a.string().required(), resend: a.boolean() })
    .returns(a.ref('FamilyMember'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(family)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
})
