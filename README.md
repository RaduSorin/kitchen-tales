# Kitchen Tales

Aplicație personală pentru familie (telefon, tabletă, web) cu două părți:

- **Rețete**: listă cu căutare și categorii, adăugare și editare cu poză, ingrediente și pași, import din text lipit.
- **Povești**: bibliotecă pentru copii cu player mare, încărcare fișiere audio sau înregistrare cu vocea ta.

Se instalează pe ecranul principal ca aplicație (PWA).

## Cum e construită

- Frontend: React + TypeScript + Vite, în `src/`
- Backend AWS Amplify (Gen 2), definit în cod în `amplify/`:
  - **Login** (Cognito), doar pe invitație: conturile se creează din consola AWS Cognito
  - **Rețete și povești** în baza de date (AppSync + DynamoDB)
  - **Poze și fișiere audio** în S3 (`recipe-photos/`, `stories/`), private, accesibile doar după login
- `amplify.yml`: Amplify Hosting construiește backend-ul și frontend-ul la fiecare push pe `main`

## Publicare

1. În consola AWS Amplify: *Deploy an app* → GitHub → `kitchen-tales`, branch `main`.
2. În *Hosting → Rewrites and redirects* adaugă regula pentru aplicații single-page:
   sursa `</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|mp3|m4a|webm)$)([^.]+$)/>`, ținta `/index.html`, tip `200 (Rewrite)`.
3. În Cognito (user pool-ul creat de Amplify) creează utilizatorii familiei.

## Dezvoltare locală

```bash
npm install
npx ampx sandbox   # creează un backend de test în contul tău AWS și scrie amplify_outputs.json
npm run dev
```
