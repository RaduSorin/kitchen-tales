# Kitchen Tales

A personal family app (phone, tablet, web), shown in the app as **Bucătăria cu povești**. It installs on the home screen like a native app (PWA), is used mostly on iPhone, and its UI is in Romanian.

- **Recipes**: list, search (Romanian plurals and diacritics), categories and views; add by pasting a link (sites, YouTube, TikTok, Instagram), pasted text, photos, dictation, or with AI ("what can I cook from my fridge"); nutrition and allergens; scaling; favourites, cooking log and notes; cook mode with timers that alarm through push notifications, and a hands-free voice mode.
- **Cookbook PDF**: Profile › "Caietul de rețete" makes an A5 book of the space's recipes on the phone (cover, contents with links, a page per recipe with photo, ingredients, steps, notes and how often it was cooked), in a light "Clasic" or a dark "Seară" style, then opens the share sheet. Layout in `src/lib/cookbook/pdf.ts`, fonts in `public/fonts/pdf/` (OFL).
- **My week and shopping**: plan dinners per day (also planned by AI), and a shopping list that merges the same ingredient from several recipes and sorts it by shop aisle.
- **Stories**: a library of audio stories with folders, bookshelf and Cover Flow views, and a full player (queue, lock-screen controls, sleep fade, offline copies). Stories can be uploaded, recorded in your own voice, or written by AI and narrated with ElevenLabs (Polly as fallback).
- **Kid mode**: Profile › (the child) › "Modul copil". A 4-digit PIN turns a device into a stories-only player with the folders the parent picked and an optional time limit. Combine it with iPhone Guided Access.
- **Spaces and sharing**: every account belongs to a space (a household). Sorin and Loredana share one space; other invited accounts have their own and see only what is shared with all accounts. Stories start in our space by default; recipes start private.
- **Răgaz**: a private area for monthly intentions, exercises, a journal, a worry list and reflections, with optional Claude chat and Friday push reminders. It is encrypted on the phone (Face ID or a backup code). The server keeps only an encrypted backup.

## Architecture

- Frontend: React + TypeScript + Vite, in `src/`. Lists are cached on the phone (IndexedDB) and shown first, then refreshed from the server.
- Backend: AWS Amplify Gen 2 in `amplify/` (region `eu-central-1`):
  - **Auth**: Cognito, invite-only (only admins invite, from Profile › "Invită pe cineva", through the `family` function). Cognito groups: `space-<id>` per household, `everyone`, `admins`.
  - **Data**: AppSync + DynamoDB (`Recipe`, `Story`, `StoryFolder`, `StoryFavorite`, `RecipeLog`, `MealPlanEntry`, `ShoppingItem`, `FamilySettings`, `ExercisePack`). Rows carry `spaceGroups` (full access) and `readerGroups` (read-only sharing). Point-in-time recovery is on for every table.
  - **Files**: S3 with versioning (old versions kept 30 days). The app has no direct S3 access: the `files` function checks the caller's space and signs links.
  - **Functions**: `import-recipe` (Claude on Bedrock for import, ideas, week plan, nutrition; Stable Image for photos), `generate-story` (Claude + ElevenLabs/Polly), `find-cover`, `timer-alarm` and `mind-push` (Web Push through EventBridge Scheduler), `mind-coach` (Răgaz chat), `client-log` (error reports from the app to CloudWatch). Long AI work runs as async jobs (`amplify/shared/jobs.ts`).
  - **Limits**: paid AI work is capped per space and month (`amplify/shared/aiUsage.ts`); Răgaz chat per person (`amplify/shared/mindCoach.ts`).
- Secrets (Amplify console › Hosting › Secrets): `ELEVENLABS_API_KEY`, `VAPID_PRIVATE_KEY`.
- `amplify.yml`: Amplify Hosting deploys the backend and frontend on every push to `main`.

## Deployment

1. In the AWS Amplify console (region `eu-central-1`): *Deploy an app* → GitHub → `kitchen-tales`, branch `main`.
2. Under *Hosting → Rewrites and redirects*, add the single-page-app rule:
   source `</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|mp3|m4a|webm|mp4)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
3. In the Cognito user pool created by Amplify, create the first account. Everyone else can then be invited from Settings → Family.

## Local development

```bash
npm install
npx ampx sandbox   # creates a personal test backend in your AWS account and writes amplify_outputs.json
npm run dev
```

## Checks

Every pull request runs `.github/workflows/check.yml`: type-check (app, tests, backend), lint, unit tests and a production build. Run the same locally:

```bash
npx tsc -b && npx tsc --noEmit -p amplify && npm run lint && npm test && npm run build
```

Unit tests live in `test/` (Vitest) and cover the logic that needs no browser or AWS: ingredient scaling, shopping list merge, search, hands-free commands, recipe text parsing, Răgaz encryption and the AI limit. Test reports from manual QA passes are in `docs/qa/`.
