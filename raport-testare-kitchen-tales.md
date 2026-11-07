# Raport de testare – Bucătăria cu povești (kitchen-tales)

**Data:** 7 noiembrie 2026 · **Versiune testată:** `main` @ `ea787f3` (PR #68)
**Zone:** Rețete · Mod gătit · Săptămâna mea / Planificare · Cumpărături · Povești (acasă, bibliotecă, player, adăugare) · Modul copil · Profil și setări · Offline · Backend (Lambda, autorizare)

---

## 1. Cum am testat

| Nivel | Ce am făcut | Rezultat |
|---|---|---|
| Static | `tsc -b` (aplicația) + `tsc` pe `amplify/` | ✅ 0 erori |
| Lint | `oxlint` | ✅ 0 erori, 25 avertismente (vezi L14) |
| Build | `vite build` + PWA | ✅ trece; bundle JS 1,3 MB (375 KB gzip) într-un singur fișier |
| Rulare în browser | Chromium (Playwright) în format iPhone 13 și desktop 1280 px, cu **backend simulat**: sesiune Cognito falsă, AppSync în memorie generat din schema reală (`amplify/data/resource.ts`), S3 fals pentru poze și audio | 20 de rute + aproximativ 40 de fluxuri |
| Review de cod | Tot backend-ul (`amplify/`) și paginile/lib-urile principale din `src/` | vezi problemele de mai jos |

**Limite:** n-am apelat AWS-ul real (Bedrock, Polly, ElevenLabs, Transcribe, Web Push, Scheduler), n-am testat pe Safari/iOS real și nici cu microfon. Site-ul live nu se putea accesa din mediul de test. Problemele care depind de acestea sunt marcate **„De verificat”**.

> **Actualizare:** pe branch-ul `claude/charming-clarke-6n1rqf` sunt rezolvate toate problemele mari și medii și 14 din cele 19 mici (L14 parțial). L15, L16, L17 și L19 sunt lăsate intenționat; motivele sunt în secțiunea 5.

**Legendă status:** 🟢 *Confirmat în browser* · 🔵 *Confirmat în cod* · 🟠 *Risc, de verificat în producție*

---

## 2. Rezumat

| Severitate | Număr | Pe scurt |
|---|---|---|
| 🔴 Mare | 3 (toate rezolvate) | Timeout AppSync la AI, setările unui cont copiate în alt cont, schimbarea contului fără reîncărcare |
| 🟠 Medie | 7 (toate rezolvate) | Modificări pierdute fără semnal stabil, redenumire/ștergere folder, acces la fișiere, coperta de pe „Acasă” la Povești, PIN, gesturi în modul gătit, keep-awake pe iOS |
| 🟡 Mică / cosmetic | 19 (14 rezolvate, 1 parțial, 4 lăsate intenționat) | Accesibilitate, euristici, texte, performanță, mentenanță |

**Ce merge bine:** toate cele 20 de rute se încarcă fără erori în consolă. Editorul de rețete (inserare pas, drag & drop), scalarea porțiilor, lista de cumpărături (cumulare cantități, raioane), modul offline de bază, căutarea (fără diacritice), modul copil (redirecționări, blocare la final de timp, ieșire cu PIN), încărcarea și generarea unei povești și protecțiile „Pleci fără să salvezi?” funcționează corect.

---

## 3. Probleme de severitate mare 🔴

### H1. Operațiile AI lungi depășesc limita fixă de 30 s a AppSync 🟠 — ✅ REZOLVAT
- **Rezolvare:** aplicația pornește munca AI cu mutații asincrone (`startGenerateStory`, `startImportRecipe`, `startSuggestRecipes`, `startPlanWeek`, cu `a.handler.function(...).async()`). Funcția rulează în fundal și scrie rezultatul sau eroarea în `ai-jobs/<spațiu>/<job>.json`; aplicația așteaptă fișierul printr-un link semnat, apoi îl șterge (`amplify/shared/jobs.ts`, `jobResult.ts`, `src/lib/db.ts` `runJob`). Lambda nu mai reîncearcă singură (`retryAttempts: 0`), resturile se șterg după o zi (regulă de lifecycle pe bucket), iar `planWeek` scrie cel mult 2 rețete noi pe server (rezolvă și L7). Interogările sincrone vechi rămân pentru versiunile aplicației deja deschise.
- **Zone:** Creează o poveste (Claude + ElevenLabs/Polly), Propune cinele săptămânii cu „Și câteva noi”, Rețetă din 2–4 poze.
- **Detalii:** Lambda-urile au `timeoutSeconds: 180` (`amplify/functions/generate-story/resource.ts:11`) și `120` (`import-recipe/resource.ts:9`). AppSync însă oprește orice resolver după **30 s**, iar limita nu se poate mări. `planWeek` face întâi un apel Claude, apoi scrie până la 2 rețete noi (`import-recipe/handler.ts:490-497`). UI-ul chiar spune „durează cam o jumătate de minut” (`src/pages/PlanWeek.tsx:206`). La o poveste lungă (7 min, aproximativ 3 bucăți ElevenLabs succesive) depășirea e aproape sigură.
- **Efect:** utilizatorul vede eroare sau timeout, dar Lambda continuă: MP3-ul se scrie în S3 și rămâne orfan, iar creditele ElevenLabs și costul Bedrock se plătesc. La „Încearcă din nou” se plătesc încă o dată.
- **De verificat:** CloudWatch → durata Lambda `generate-story` și `import-recipe` față de erorile AppSync „Execution timed out”.
- **Sugestie:** un tipar asincron: mutația pornește un job (Lambda invocată asincron), iar clientul urmărește rezultatul prin polling sau subscription pe un rând „Job”.

### H2. Setările unui cont ajung în spațiul altui cont pe același dispozitiv 🟢 — ✅ REZOLVAT
- **Rezolvare:** când alt cont se conectează pe dispozitiv, `space.ts` (`onAccountChange`) resetează setările de familie (alegerile dispozitivului, ca „clic pe raft”, rămân), modul copil și listele săptămânii și cumpărăturilor, inclusiv modificările netrimise. Sincronizarea așteaptă întâi să afle contul (`spaceReady()`) și abia apoi trimite ceva.
- **Pași:** contul A folosește tableta (are copil, PIN de copil, dietă). Pe aceeași tabletă se conectează contul B (cont separat nou, încă fără rând de setări).
- **Rezultat obținut:** la pornire aplicația creează `FamilySettings` pentru B cu numele copilului lui A, **hash-ul PIN-ului** lui A, dieta și orașul lui A. Profilul lui B arată „Ionel (copilul lui A) · modul copil: 30 min”.
- **Rezultat așteptat:** B pornește cu setări goale.
- **Cauză:** `src/lib/space.ts:11`. `KEEP` păstrează `kt-settings` la schimbarea contului, iar `settingsSync.ts:76` (`hasAny(shared()) → push()`) trimite setările locale ca „prima salvare” a noului spațiu. Același lucru se întâmplă prin `push()` dacă A avea modificări netrimise.
- **Sugestie:** la schimbarea contului trebuie resetate și `kt-settings` (doar câmpurile partajate) și obiectul `current` din memorie. Alternativ, `sync()` trebuie să aștepte `spaceReady()` înainte să citească `isDirty()`.

### H3. „Ieși din cont” urmat de conectarea cu alt cont, fără reîncărcarea paginii, folosește spațiul vechi 🔵 — ✅ REZOLVAT
- **Rezolvare:** la evenimentul Amplify `signedOut` aplicația pornește din nou de la zero (`src/main.tsx`, `Hub.listen`).
- **Cauză:** starea se ține în module JavaScript care nu se resetează la deconectare: `spaceReady()` (`space.ts:50`, `loading ??= load()`), `me.ts:21`, `useFamily.cached` (`FamilySection.tsx:16`), harta `owners` din `db.ts`, listele sincronizate (`plan.ts:8-9`). Authenticator demontează doar `<App/>`, nu reîncarcă pagina. Nicăieri nu există `location.reload()` sau `Hub.listen('auth')`.
- **Efect:** al doilea cont își vede propriile rețete marcate „De la …” (nu le poate edita). Rândurile noi se creează cu `spaceGroups` al primului cont și sunt refuzate de server. Operațiile netrimise ale contului vechi se trimit cu tokenul celui nou.
- **Sugestie:** `window.location.reload()` după `signOut()`. Ar acoperi și „Am uitat PIN-ul”.

---

## 4. Probleme de severitate medie 🟠

### M1. Lista de cumpărături și săptămâna pierd modificări fără să anunțe, când semnalul e slab 🟢 — ✅ REZOLVAT
- **Rezolvare:** o schimbare care nu ajunge la server (fără semnal) nu se mai pierde: rămâne în coadă și se reîncearcă la 15 s, la revenirea în aplicație și când revine internetul. Erorile de rețea, pe care Amplify le raportează tot în `errors`, dar fără `errorType`, nu se mai numără ca refuzuri. O schimbare refuzată de server de 5 ori se abandonează cu mesajul „Nu am putut salva o schimbare în lista de cumpărături”. „Există deja / a fost deja ștearsă” (răspuns pierdut) se consideră făcută (`src/lib/synced.ts`, `db.ts` `Rejected`).
- **Pași:** semnal slab în magazin (`navigator.onLine` = true, dar cererile eșuează) → adaugi „ou de test” → aplicația reîncearcă la fiecare revenire în aplicație sau eveniment `online`.
- **Rezultat:** după 5 încercări eșuate operația e **aruncată** (`src/lib/synced.ts:51-53`). La următorul refresh produsul dispare din listă și nu ajunge niciodată pe server.
- **Așteptat:** modificarea rămâne în coadă până reușește, sau utilizatorul e anunțat.
- **Sugestie:** tratează separat erorile de rețea (fără limită) de refuzurile serverului (cu limită și un toast „Nu am putut salva X”).

### M2. Redenumirea sau ștergerea unui folder modifică și poveștile altui spațiu cu același nume de folder 🟢 — ✅ REZOLVAT
- **Rezolvare:** se mută doar poveștile proprii (`mine !== false`); redenumirea și ștergerea reușesc.
- **Pași:** Ana partajează o poveste din folderul ei „Basme”. Tu ai propriul folder „Basme”. Redenumești folderul tău în „Basme vechi”.
- **Rezultat:** aplicația încearcă `updateStory` și pe povestea Anei (`sx`), iar serverul refuză (Unauthorized). Folderul și poveștile tale sunt deja redenumite, dar foaia rămâne deschisă cu eroare. La **ștergere** bucla se oprește înainte de `StoryFolder.delete`, deci folderul nu se mai șterge deloc.
- **Cauză:** `src/lib/db.ts:403` și `db.ts:411` filtrează doar după `collection === name`, fără `mine`.
- **Fix:** `.filter((x) => x.mine !== false && x.collection === oldName)`.

### M3. Funcția `files` permite citirea oricărui fișier al cărui path e cunoscut 🔵 (securitate) — ✅ REZOLVAT
- **Rezolvare:** un fișier din folderul spațiului X se deschide doar prin rânduri ale spațiului X. Un fișier vechi (fără folder) se deschide doar prin rânduri create înainte de 5.11.2026, când au apărut folderele. Rândurile făcute acum care arată spre fișierul altcuiva nu mai deschid nimic, iar oprirea partajării taie accesul. Am verificat cu 8 cazuri (citire, ștergere, partajat sau nu, fișiere vechi).
- **Cauză:** `amplify/functions/files/handler.ts:55-66`. Pentru un fișier din folderul altui spațiu, accesul se dă dacă **un rând pe care apelantul îl poate citi** pointează la acel path. Apelantul își poate crea singur un astfel de rând (o rețetă proprie cu `photoKey` = path-ul altcuiva).
- **Efect:** oprirea partajării nu revocă accesul la poze și audio pentru cine a văzut deja path-ul (path-urile rămân în IndexedDB pe dispozitivele lor). Fișierele **vechi** (dinainte de foldere pe spațiu, fără `space-…` în path) pot fi chiar **șterse** prin același mecanism (`write=true` ajunge la verificarea pe rând).
- **Risc practic:** mic într-o aplicație de familie pe bază de invitație, dar e o breșă de izolare între spații.
- **Sugestie:** pentru un fișier din folderul spațiului X, acceptă doar rânduri cu `row.spaceGroups.includes(X)`. Fișierele vechi merită mutate în foldere pe spațiu, după care regula „fără folder” poate fi eliminată.

### M4. „Acasă” la Povești: emoji-ul copertei desenate apare tăiat în colțul stânga-sus 🟢 (regresie din `2c1e53f`) — ✅ REZOLVAT
- **Rezolvare:** `display: grid` pe coperta din carusel. Am scos și sublinierea linkului, care desena o bară aurie sub emoji.
- **Unde:** caruselul de sus de pe `/povesti/acasa`, la poveștile fără poză (telefon și desktop).
- **Rezultat:** emoji-ul (🐻) apare în colțul stânga-sus, parțial în afara ecranului, sub comutatorul Rețete/Povești, nu centrat pe copertă (pe telefon e la y = −10 px).
- **Cauză:** `src/stories-a.css:1064` `.vt-photo > * { display: block }` suprascrie `display: grid; place-items: center` de pe `.story-cover` (`index.css:400`).
- **Fix:** `.vt-cover .vt-photo > .story-cover { display: grid; }`.

### M5. Tastatura PIN numără mai multe încercări greșite la apăsări rapide 🟢 — ✅ REZOLVAT
- **Rezolvare:** cu 4 cifre introduse, alte apăsări se ignoră. 6 apăsări rapide numără acum o singură încercare greșită.
- **Pași:** pe ecranul de blocare, copilul apasă repede de 6 ori pe „9”.
- **Rezultat:** 3 încercări greșite (după a 4-a cifră, fiecare apăsare retrimite aceleași 4 cifre). După 8 apăsări rapide părintele e blocat 30 s, apoi câte 2 min la fiecare încercare.
- **Cauză:** `src/components/KidMode.tsx:25-31`: `press()` acceptă cifre și când `pin.length === 4` și programează din nou `onPin`.
- **Fix:** ignoră apăsările cât timp `pin.length === PIN_LEN` sau verificarea e în curs.

### M6. Modul gătit: gesturile din foaia „Ingrediente” schimbă pasul sau închid foaia 🔵 — ✅ REZOLVAT
- **Rezolvare:** gesturile care încep în foaia de ingrediente doar derulează lista; pe pas, swipe-ul merge ca înainte.
- **Cauză:** `onTouchStart` și `onTouchEnd` stau pe tot containerul `.cook` (`CookMode.tsx:192-204`, foaia la `:266`), deci și peste foaia de ingrediente.
- **Efect:** când derulezi lista în sus (deget în jos > 60 px), foaia se închide. Un swipe orizontal în listă schimbă pasul.
- **Fix:** `stopPropagation` pe foaie, sau ignoră gesturile pornite în interiorul `.cook-sheet`.

### M7. Fallback-ul „ține ecranul aprins” pe iPhone probabil nu se încarcă 🟠 — ✅ REZOLVAT
- **Rezolvare:** clipul (1,7 KB) e acum inclus în codul aplicației și rulează dintr-un link blob, deci nu mai depinde de regula de rewrite și merge și offline. Am adăugat și `mp4` în regula din README.
- **Cauză:** `keepAwake.ts:21` folosește `/keep-awake.mp4`, iar regula SPA din README (Amplify Rewrites) nu are `mp4` în lista de extensii. Fișierul ar fi rescris la `index.html` (HTML în loc de video). Nici service worker-ul nu-l pune în cache (`vite.config.ts`, `globPatterns`).
- **Efect:** pe iOS (unde wake lock-ul nu ține în aplicația de pe ecranul principal) telefonul se poate bloca în timpul înregistrării sau dictării, iar microfonul se oprește.
- **De verificat:** deschide `https://main.d1b5q3cpreuzof.amplifyapp.com/keep-awake.mp4`. Dacă primești HTML, adaugă `mp4` în regex-ul de rewrite.

---

## 5. Probleme mici, cosmetice și de mentenanță 🟡

| ID | Zonă | Problemă | Status | Unde |
|---|---|---|---|---|
| L1 ✅ | Mod gătit | Cronometrele sună în aplicație doar cât stai pe ecranul de gătit. Dacă revii la rețetă și nu ai push activ (desktop, Android fără notificări, iOS neinstalat), alarma nu sună. | 🔵 | `CookMode.tsx:127-145` |
| L2 ✅ | Editor rețete (a11y) | Mutarea unui pas cu ↑/↓ pe mâner pierde focusul după o singură mutare. | 🟢 | `RecipeEdit.tsx` `StepItem` |
| L3 ✅ | Mod gătit (a11y) | Tasta Space trece mereu la pasul următor, chiar și pe butoane sau bife din foaia de ingrediente. | 🔵 | `CookMode.tsx:113` |
| L4 ✅ | Cumpărături | „suc de lămâie” ajunge la Băuturi (prefixul `suc`). | 🟢 | `aisles.ts:28` |
| L5 ✅ | Scalare porții | Substantivele nu se acordă: „1 ½ ou”, „1 ouă” (2 ouă la jumătate). | 🟢 | `scale.ts` `tidyUnit` |
| L6 ✅ | Planificare | Serile cu „Resturi: …” nu se salvează în săptămână, așa că ziua apare goală. | 🔵 | `PlanWeek.tsx:116` |
| L7 ✅ | Planificare (backend) | Limita „cel mult 2 rețete noi” nu se verifică pe server. Zilele omise de model devin „O cină rapidă” nouă, deci pot fi până la 7 generări în paralel (cost și timp, agravează H1). | 🔵 | `import-recipe/handler.ts:484-497` |
| L8 ✅ | Bibliotecă | Pe telefon, în antetul folderului, „2 povești” e acoperit de pastila „Partajat”. | 🟢 (vizual) | `shelf-head` |
| L9 ✅ | Bibliotecă | Eticheta „1 min” acoperă titlul desenat pe copertă („Scufița Roș…”). | 🟢 (vizual) | grila de povești |
| L10 ✅ | Mesaje | `errors?.map(...).join('; ') ?? 'Eroare…'` dă un mesaj gol când `errors = []` (folosește `\|\|`). | 🔵 | `db.ts:292, 525` |
| L11 ✅ | Profil | Numele spațiului („Spațiul Sorin”) nu se poate schimba din UI; vine din email sau din rândul vechi. | 🔵 | `space.ts`, `Profile.tsx` |
| L12 ✅ | Povești Acasă | „Povestea de diseară” se schimbă la miezul nopții UTC (02:00/03:00 în România), nu la miezul nopții local. | 🔵 | `StoriesHome.tsx:111` |
| L13 ✅ | Performanță | Un singur chunk JS de 1,3 MB; rutele nu se încarcă leneș (`React.lazy`). | 🟢 | build |
| L14 ◐ | Calitate cod | 25 de avertismente oxlint: `set-state-in-effect` (8), `purity` (`Date.now` în render, 3), `refs` (1), `exhaustive-deps` în `CoverSearch.tsx:25` (lipsesc `title` și `run`). | 🟢 | lint |
| L15 ➖ | Rețete | Valorile nutriționale se calculează automat cu AI la prima deschidere a oricărei rețete fără valori. Pentru rețetele altui spațiu se recalculează pe fiecare dispozitiv (cost). | 🔵 | `RecipeFacts.tsx:45` |
| L16 ➖ | Securitate / cost | Bedrock, ElevenLabs (`previewVoice`), Transcribe și Polly pot fi apelate de orice cont conectat, fără limită de frecvență. | 🔵 | `data/resource.ts`, `backend.ts` |
| L17 ➖ | Securitate | `safeFetch` verifică DNS-ul și apoi face `fetch` separat (fereastră pentru DNS rebinding). | 🔵 | `shared/safeFetch.ts` |
| L18 ✅ | Robustețe | Ștergerea unei povești sau rețete șterge întâi fișierele. Dacă ștergerea rândului eșuează, rămâne un rând cu audio sau poză lipsă. Invers, `createStory` eșuat după upload lasă un fișier orfan. | 🔵 | `db.ts:217-223, 296-303` |
| L19 ➖ | Build | `amplify.yml` folosește `npm install`, nu `npm ci` (build-uri nereproductibile; e documentat în fișier). | 🔵 | `amplify.yml` |

### Ce s-a făcut la problemele mici

- **L1:** un cronometru care se termină pe alt ecran al aplicației sună acolo, cu mesajul „Cronometrul e gata: …, pasul N” și butonul „Deschide”, care duce la pas (`src/lib/cookAlarms.ts`).
- **L2:** după mutarea unui pas cu ↑/↓, focusul rămâne pe mâner. **L3:** în modul gătit, Space pe un buton sau o bifă nu mai schimbă pasul.
- **L4:** „suc de la o lămâie”, „zeamă/coajă de lămâie” ajung la Legume și fructe; „1 l suc de portocale” rămâne la Băuturi.
- **L5:** la scalare se acordă și substantivele (ou/ouă, ceapă/cepe, roșie/roșii, cartof/cartofi…) și „mare/mari”: „1 ou”, „1 ½ cepe mari”, „½ ceapă mare”.
- **L6:** serile cu resturi se salvează în săptămână ca „Resturi: …”, cu rețeta din seara de dinainte. Nu intră la cumpărături și nici la „Azi în plan” (câmpul nou `MealPlanEntry.leftovers`).
- **L8:** „2 povești” era de fapt doar greu de citit pe fundalul auriu; acum are contrast. **L9:** pe cardurile cu durată, coperta desenată nu mai repetă titlul (e scris oricum sub card).
- **L10:** mesajele de eroare nu mai pot ieși goale. **L12:** „Povestea de diseară” se schimbă la miezul nopții local.
- **L11:** Profil › „Numele spațiului”: se poate schimba, iar numele nou ajunge și pe ce e deja partajat.
- **L13:** paginile se încarcă la prima deschidere; codul de pornire scade de la 1,35 MB la circa 1,08 MB. Dacă după o versiune nouă lipsește fișierul unei pagini, aplicația se reîncarcă o singură dată.
- **L14 (parțial):** am explicat în cod singurul avertisment care ascundea o intenție (`CoverSearch`). Celelalte 24 sunt de stil (`set-state-in-effect`, `Date.now` în render) și nu produc erori.
- **L18:** la ștergere, fișierele din folderul spațiului se șterg după rând (un rând care nu se poate șterge nu-și mai pierde audio-ul); fișierele încărcate de o salvare de poveste eșuată se șterg.

**Lăsate intenționat:**
- **L15:** valorile nutriționale ale rețetelor altui spațiu nu se pot salva pe rândul lor; un apel AI per dispozitiv și versiune de rețetă e un cost mic.
- **L16:** o limită de folosire pentru funcțiile AI cere o decizie (câte pe zi, pe cont); aplicația e doar pe invitație.
- **L17:** Lambda nu are adresa de metadate 169.254.169.254, iar credențialele ei sunt în variabile de mediu, deci DNS rebinding n-are ce expune.
- **L19:** `npm install` e folosit intenționat, din cauza unei probleme a npm cu un pachet Amplify (e explicat în `amplify.yml`).

---

## 6. Ce a trecut (pe scurt)

- **Rute:** `/`, `/retete`, `/retete/:id` (propria, partajată, a altui spațiu), editare, nouă, mod gătit, săptămână, planificare, cumpărături, povești (acasă, bibliotecă, player, adaugă), căutare, profil (+ subpagini) și 404. Toate se încarcă fără erori în consolă; pe desktop nu există scroll orizontal.
- **Rețete:** inserare pas între pași, drag & drop pași, validare câmpuri numerice (blocată nativ), scalare 4 → 6 porții (750 g, 3 l, 1 ½ ceapă), „Pune în listă” (înlocuiește cantitatea veche a aceleiași rețete), „În săptămână”, rețeta altui spațiu doar în citire (editorul redirecționează).
- **Cumpărături:** cumulare („2 cepe mari” + „1 ceapă” = „3 cepe mari”; 1 kg + 500 g = „1 ½ kg cartofi”), gruparea pe raioane, bifare, mod offline cu sincronizare la revenirea online.
- **Povești:** redare, mini-player păstrat la navigare, următoarea poveste, favorite (inclusiv pentru povestea altui spațiu, prin `StoryFavorite`), meniul „Pentru părinți” corect pentru povești proprii și primite, încărcare fișier (titlu din numele fișierului, durată), generare (folosește automat copilul din profil), „Pleci fără să salvezi?”.
- **Modul copil:** setare PIN (de două ori), pornire, blocarea rutelor `/retete`, `/profil`, `/cauta`, `/saptamana`, `/povesti/adauga`, păstrare după reîncărcare, ecranul „Poveștile s-au culcat” la final de timp, ieșire prin apăsare lungă + PIN.
- **Căutare:** fără diacritice („perisoare”, „scufita”), mai multe cuvinte, mesaj pentru niciun rezultat.

---

## 7. Recomandare de prioritizare

1. **Repede și ieftin:** M4 (o linie CSS), M2 (un filtru), M5, L10, apoi verificarea M7 pe site-ul live.
2. **Pierdere sau scurgere de date:** H2 + H3 (reîncărcare la deconectare, curățarea setărilor la schimbarea contului), M1.
3. **Arhitectură:** H1 (joburi asincrone pentru AI), apoi M3 (regula de acces la fișiere).
4. **Polish:** M6, L1–L9, L13.
