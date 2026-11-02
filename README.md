# Kitchen Tales

A personal family app (phone, tablet, web) with two parts:

- **Recipes**: list with search and categories; add and edit recipes with a photo, ingredients and steps; import from pasted text.
- **Stories**: a kid-friendly library of audio stories with a big player; upload audio files or record stories in your own voice.

It installs on the home screen like a native app (PWA). The app UI is in Romanian.

## Architecture

- Frontend: React + TypeScript + Vite, in `src/`
- Backend: AWS Amplify Gen 2, defined in code in `amplify/`
  - **Auth** (Cognito), invite-only: self sign-up is disabled; family accounts are created in the Cognito console
  - **Recipes and stories** stored in AppSync + DynamoDB, readable and editable by every signed-in family member
  - **Photos and audio** stored in S3 (`recipe-photos/`, `stories/`), private to signed-in users; photos are resized in the browser before upload
- `amplify.yml`: Amplify Hosting builds the backend and frontend on every push to `main`

## Deployment

1. In the AWS Amplify console (region `eu-central-1`): *Deploy an app* → GitHub → `kitchen-tales`, branch `main`.
2. Under *Hosting → Rewrites and redirects*, add the single-page-app rule:
   source `</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|mp3|m4a|webm)$)([^.]+$)/>`, target `/index.html`, type `200 (Rewrite)`.
3. In the Cognito user pool created by Amplify, create the family's user accounts.

## Local development

```bash
npm install
npx ampx sandbox   # creates a personal test backend in your AWS account and writes amplify_outputs.json
npm run dev
```
