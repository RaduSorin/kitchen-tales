import { a, defineData, type ClientSchema } from '@aws-amplify/backend'
import { importRecipe } from '../functions/import-recipe/resource'
import { generateStory } from '../functions/generate-story/resource'
import { findCover } from '../functions/find-cover/resource'

import { family } from '../functions/family/resource'
import { timerAlarm } from '../functions/timer-alarm/resource'
import { files } from '../functions/files/resource'

// Every row belongs to a space (a household): its Cognito group `space-<id>` is in `spaceGroups`
// and its members can read and edit it. A recipe, story or folder that is shared also has the
// group every account is in (`everyone`) in `readerGroups`, which lets other spaces read it.
// Week plan, shopping list and settings are never shared. See amplify/shared/spaces.ts.
// Only the space's own members can read which space a row belongs to: other spaces get null here,
// so they never learn another space's group name and cannot add it to rows of their own.
const spaceGroupsField = () => a.string().array().authorization((allow) => [allow.groupsDefinedIn('spaceGroups')])

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
      // Estimated by AI from the ingredients (JSON, see src/lib/diet.ts): values per serving and
      // the allergens with the ingredients they come from. Empty until worked out.
      nutrition: a.string(),
      allergens: a.string(),
      notes: a.string(),
      sourceUrl: a.string(),
      photoKey: a.string(),
      // Sharing: see the comment at the top. Recipes start private.
      spaceGroups: spaceGroupsField(),
      readerGroups: a.string().array(),
      // The owning space's name, shown to other spaces ("De la Sorin").
      spaceName: a.string(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups'), allow.groupsDefinedIn('readerGroups').to(['read'])]),

  Story: a
    .model({
      title: a.string().required(),
      emoji: a.string(),
      // The drawn cover's colours (an index into SCENES in src/lib/stories.ts); none: picked from the title.
      scene: a.integer(),
      coverKey: a.string(),
      // Shelf folder for a set of stories added together (e.g. a bought collection).
      collection: a.string(),
      source: a.enum(['upload', 'recording', 'generated']),
      audioKey: a.string().required(),
      durationSec: a.float(),
      text: a.string(),
      // The child's favourite stories (the "Favorite" tab); shared by the family.
      favorite: a.boolean(),
      // Sharing: see the comment at the top. Stories start shared. `sharedDirect` means shared on its
      // own, not only because its folder is shared, so it stays shared when moved out of that folder.
      spaceGroups: spaceGroupsField(),
      readerGroups: a.string().array(),
      sharedDirect: a.boolean(),
      spaceName: a.string(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups'), allow.groupsDefinedIn('readerGroups').to(['read'])]),

  // A shelf folder the family made themselves (e.g. kids' music). Stories join it through
  // Story.collection = name, so a folder can exist before anything is moved into it.
  StoryFolder: a
    .model({
      name: a.string().required(),
      icon: a.string(),
      // Sharing a folder shares every story in it (their readerGroups are set too).
      spaceGroups: spaceGroupsField(),
      readerGroups: a.string().array(),
      spaceName: a.string(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups'), allow.groupsDefinedIn('readerGroups').to(['read'])]),

  // A favourite story of a space, for a story another space shared (its own stories use
  // Story.favorite). id = `<space group>:<story id>`, so it can be removed without a lookup.
  StoryFavorite: a
    .model({
      storyId: a.string().required(),
      spaceGroups: a.string().array(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups')]),

  // What a space remembers about a recipe, its own or one another space shared: whether it is a
  // favourite, the days it was cooked (YYYY-MM-DD) and the notes written after cooking (JSON
  // {day, text, by} each). One row per recipe and space.
  RecipeLog: a
    .model({
      recipeId: a.string().required(),
      favorite: a.boolean(),
      cooked: a.string().array(),
      notes: a.string().array(),
      spaceGroups: a.string().array(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups')]),

  // A recipe planned for a day in "Săptămâna mea". `day` is a local date, YYYY-MM-DD.
  MealPlanEntry: a
    .model({
      day: a.string().required(),
      recipeId: a.string().required(),
      servings: a.integer(),
      // Leftovers of this recipe (cooked the evening before): nothing to cook or buy that day.
      leftovers: a.boolean(),
      spaceGroups: a.string().array(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups')]),

  // One line of the family shopping list, optionally from a recipe.
  ShoppingItem: a
    .model({
      text: a.string().required(),
      checked: a.boolean(),
      recipeId: a.string(),
      recipeTitle: a.string(),
      spaceGroups: a.string().array(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups')]),

  // A space's settings (the child, the city for the stories sky, the kitchen tools, kid mode), kept
  // in the cloud so they survive a cleared phone and are the same on every device. One row per
  // space, id = the space group (the old single row, id "family", is kept only as a backup).
  FamilySettings: a
    .model({
      childName: a.string(),
      childBirthYear: a.integer(),
      childGender: a.string(),
      childCanRead: a.boolean(),
      city: a.string(),
      kitchenTools: a.string().array(),
      // Kid mode: PIN (salted SHA-256), default time limit, folders the child may see.
      kidPinHash: a.string(),
      kidPinSalt: a.string(),
      kidMinutes: a.integer(),
      kidFolders: a.string().array(),
      // What the family doesn't eat (JSON, see src/lib/diet.ts): respected by recipe generation.
      diet: a.string(),
      // The ElevenLabs voice that reads new stories (empty = Polly).
      narrator: a.string(),
      narratorName: a.string(),
      // The name other spaces see on what this space shares ("De la Sorin").
      spaceName: a.string(),
      spaceGroups: a.string().array(),
    })
    .authorization((allow) => [allow.groupsDefinedIn('spaceGroups')]),

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
    nutrition: a.string(),
    allergens: a.string(),
  }),

  // Reads a recipe from a web page link, an uploaded photo or free (typed or dictated) text,
  // or writes a new one from an idea, using only the kitchen tools given.
  importRecipe: a
    .query()
    .arguments({
      url: a.string(),
      photoKey: a.string(),
      // Several photos of one recipe (pages of a book, both sides of a note), in order.
      photoKeys: a.string().array(),
      text: a.string(),
      idea: a.string(),
      tools: a.string().array(),
      servings: a.integer(),
      // What the family doesn't eat, in words (for generation and adapting).
      diet: a.string(),
      // A saved recipe (JSON) to rewrite so it fits `diet`.
      adaptFrom: a.string(),
    })
    .returns(a.ref('ImportedRecipe'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),

  // Long AI work can't fit AppSync's fixed 30 s limit, so the app starts it with these async
  // mutations instead: the function runs in the background and writes its outcome to
  // ai-jobs/<space>/<jobId>.json (see amplify/shared/jobs.ts), which the app waits for.
  // `jobId` is a UUID made by the app. The synchronous queries stay for app versions still open.
  startImportRecipe: a
    .mutation()
    .arguments({
      jobId: a.string().required(),
      url: a.string(),
      photoKey: a.string(),
      // Several photos of one recipe (pages of a book, both sides of a note), in order.
      photoKeys: a.string().array(),
      text: a.string(),
      idea: a.string(),
      tools: a.string().array(),
      servings: a.integer(),
      // What the family doesn't eat, in words (for generation and adapting).
      diet: a.string(),
      // A saved recipe (JSON) to rewrite so it fits `diet`.
      adaptFrom: a.string(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe).async()),

  // Draws a photo for a recipe that has none (AI) and returns its storage path.
  generateRecipePhoto: a
    .mutation()
    .arguments({ title: a.string().required(), ingredients: a.string().array() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),

  RecipeIdea: a.customType({
    title: a.string().required(),
    description: a.string(),
    tools: a.string().array(),
    missing: a.string().array(),
    minutes: a.integer(),
    kcal: a.integer(),
    // What was swapped to fit the family's diet ("iaurt fără lactoză în loc de smântână").
    swaps: a.string().array(),
  }),

  // Suggests a few dishes from what is in the fridge, using only the kitchen tools given.
  suggestRecipes: a
    .query()
    .arguments({ ingredients: a.string().required(), tools: a.string().array(), diet: a.string() })
    .returns(a.ref('RecipeIdea').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),

  startSuggestRecipes: a
    .mutation()
    .arguments({ jobId: a.string().required(), ingredients: a.string().required(), tools: a.string().array(), diet: a.string() })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe).async()),

  RecipeFacts: a.customType({ nutrition: a.string(), allergens: a.string() }),

  // Plans the week's dinners: picks from the family's recipes (and writes a few new ones if
  // allowed), fitting the time each evening, the diet, what is in the fridge and variety.
  // days, recipes: JSON (see src/lib/planner.ts); returns JSON: one item per evening.
  planWeek: a
    .query()
    .arguments({
      days: a.string().required(),
      recipes: a.string(),
      recent: a.string().array(),
      fridge: a.string(),
      diet: a.string(),
      tools: a.string().array(),
      allowNew: a.boolean(),
      // Only this day again, avoiding what the rest of the week already has.
      swapDay: a.string(),
      keep: a.string().array(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),

  startPlanWeek: a
    .mutation()
    .arguments({
      jobId: a.string().required(),
      days: a.string().required(),
      recipes: a.string(),
      recent: a.string().array(),
      fridge: a.string(),
      diet: a.string(),
      tools: a.string().array(),
      allowNew: a.boolean(),
      // Only this day again, avoiding what the rest of the week already has.
      swapDay: a.string(),
      keep: a.string().array(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe).async()),

  // Estimates a saved recipe's values per serving and its allergens from the ingredients.
  analyzeRecipe: a
    .query()
    .arguments({ title: a.string().required(), servings: a.integer(), ingredients: a.string().array().required() })
    .returns(a.ref('RecipeFacts'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(importRecipe)),

  GeneratedStory: a.customType({
    text: a.string().required(),
    audioKey: a.string().required(),
    // Who read it: "elevenlabs" or "polly" (the fallback), and why, if ElevenLabs was skipped.
    narrator: a.string(),
    note: a.string(),
  }),

  // Writes a story with AI (or uses the given text) and narrates it with ElevenLabs
  // (voice = an ElevenLabs voice id) or, without a voice, with Polly.
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
      voice: a.string(),
    })
    .returns(a.ref('GeneratedStory'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateStory)),

  startGenerateStory: a
    .mutation()
    .arguments({
      jobId: a.string().required(),
      title: a.string().required(),
      prompt: a.string(),
      childName: a.string(),
      gender: a.string(),
      age: a.integer(),
      length: a.string(),
      text: a.string(),
      voice: a.string(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateStory).async()),

  NarratorVoice: a.customType({
    id: a.string().required(),
    name: a.string().required(),
    description: a.string(),
    gender: a.string(),
    age: a.string(),
    accent: a.string(),
    category: a.string(),
    romanian: a.boolean(),
  }),

  // The voices in the family's ElevenLabs account, for the narrator picker in Profile.
  narratorVoices: a
    .query()
    .returns(a.ref('NarratorVoice').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateStory)),

  // A short Romanian sample read by one voice (MP3, base64).
  previewVoice: a
    .query()
    .arguments({ voice: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateStory)),

  CoverCandidate: a.customType({
    url: a.string().required(),
    source: a.string().required(),
    label: a.string(),
  }),

  // Looks for story covers by title in the iTunes catalog and on Wikipedia.
  findCovers: a
    .query()
    .arguments({ title: a.string().required(), artist: a.string() })
    .returns(a.ref('CoverCandidate').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(findCover)),

  // Copies a found cover into the app's storage and returns its path.
  saveCover: a
    .mutation()
    .arguments({ url: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(findCover)),

  FamilyMember: a.customType({
    email: a.string().required(),
    pending: a.boolean().required(),
    createdAt: a.string(),
    // The member's space group, and whether it is the caller's own space.
    space: a.string(),
    sameSpace: a.boolean(),
  }),

  // Accounts that can sign in, with their space. Only admins (Sorin) see them and invite.
  listFamily: a
    .query()
    .returns(a.ref('FamilyMember').array())
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(family)),

  // Creates an account and emails a temporary password (resend: true sends it again).
  // separate: true gives the account its own space; otherwise it joins the inviter's space.
  inviteFamilyMember: a
    .mutation()
    .arguments({ email: a.string().required(), resend: a.boolean(), separate: a.boolean() })
    .returns(a.ref('FamilyMember'))
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(family)),

  // Stored files go through the files function, which checks the caller's space (see functions/files).
  UploadTarget: a.customType({ path: a.string().required(), url: a.string().required() }),

  // Signed links to read files, in the order asked ('' where the caller may not read one).
  // refs[i] ("Story:<id>" / "Recipe:<id>") names the row that points at paths[i].
  fileUrls: a
    .query()
    .arguments({ paths: a.string().array().required(), refs: a.string().array() })
    .returns(a.string().array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(files)),

  // A signed link to upload one new file into the caller's space folder.
  uploadUrl: a
    .mutation()
    .arguments({ prefix: a.string().required(), ext: a.string().required(), contentType: a.string() })
    .returns(a.ref('UploadTarget'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(files)),

  // Deletes files the caller's space may change; returns how many were deleted.
  deleteFiles: a
    .mutation()
    .arguments({ paths: a.string().array().required(), refs: a.string().array() })
    .returns(a.integer())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(files)),

  // Răgaz's encrypted backup, one per account (see functions/files and src/lib/mind/backup.ts).
  // op: read (a link to download it, if any), write (a link to replace it) or delete.
  MindBackupLink: a.customType({ exists: a.boolean().required(), url: a.string().required(), updatedAt: a.string(), size: a.integer() }),
  mindBackup: a
    .mutation()
    .arguments({ op: a.string().required() })
    .returns(a.ref('MindBackupLink'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(files)),

  // Cooking timers: a push notification when the timer ends, even with the app closed.
  scheduleTimerAlarm: a
    .mutation()
    .arguments({
      id: a.string().required(),
      endsAt: a.string().required(),
      title: a.string(),
      body: a.string(),
      url: a.string(),
      subscription: a.string().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(timerAlarm)),

  cancelTimerAlarm: a
    .mutation()
    .arguments({ id: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(timerAlarm)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
})
