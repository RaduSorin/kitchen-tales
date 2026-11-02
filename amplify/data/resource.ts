import { a, defineData, type ClientSchema } from '@aws-amplify/backend'

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
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
})
