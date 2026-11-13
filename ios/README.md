# Kitchen Tales for iOS (native SwiftUI)

The native iPhone app, built next to the web app in the same repo and on the same Amplify backend
(eu-central-1). The plan, by phase:

1. **Foundation** (this folder's first PRs): Xcode project, CI on macOS, style A components,
   then TestFlight upload, then Cognito sign-in with the family spaces and an on-device cache.
2. **Stories**: library, native player (Lock Screen, sleep fade with real volume, offline),
   adding stories, kid mode, sticker album.
3. **Recipes**: list and search, recipe view with scaling, adding, cooking mode with native
   timers, week plan and shopping list, culinary passport.
4. **Profile**: settings, family and invites, PDF cookbook.
5. Răgaz is not part of this app: it becomes the separate app Fallow (RaduSorin/fallow-ios).
6. **Extras**: widget, Live Activity, Siri.

## Requirements

- iOS 18 or newer (iPhone and iPad). iOS 26 features (Liquid Glass, AlarmKit) are used only
  where available.
- Nobody on the project has a Mac: everything builds in GitHub Actions on macOS runners
  (`.github/workflows/ios.yml`). The workflow runs only when `ios/` changes, and a merge that
  only touches `ios/` does not redeploy the backend (see `amplify.yml`).

## Layout

| Path | What |
| --- | --- |
| `project.yml` | XcodeGen spec; the `.xcodeproj` and `Info.plist` are generated, not committed |
| `KitchenTales/App` | App entry point and launch options |
| `KitchenTales/Auth` | Cognito sign-in without an SDK: SRP math (`BigUInt`, `CognitoSRP`), the user pool API, Keychain session, device cache |
| `KitchenTales/Design` | Style A "Seară iOS": colors (`Theme`), fonts (`AppFont`), shared components |
| `KitchenTales/Features` | Screens, one folder per area |
| `KitchenTales/Resources` | Asset catalog (icon, accent color) and the bundled fonts |
| `KitchenTalesTests` | Unit tests (Swift Testing) |
| `scripts` | Simulator picking and the Linux precheck for CI |

## Style A "Seară iOS"

The web app's colors and fonts (`src/index.css`) with Apple's patterns: large titles that
shrink on scroll, iOS search and segmented controls, grouped lists, the glass tab bar, bottom
sheets and haptics. Titles use Fraunces (recipes) and Baloo 2 / Young Serif (stories), body text
Figtree, and small print the system font. All text scales with Dynamic Type. The app is always
dark. Profil › Componente de design shows every component on one screen.

Fonts are Google Fonts static instances (SIL Open Font License), subset to Latin and Latin
Extended so they include ă â î ș ț.

## Building on a Mac (optional)

```sh
brew install xcodegen
cd ios && xcodegen generate && open KitchenTales.xcodeproj
```

## CI

The workflow runs on every push to a `claude/**` branch (and to `main`) that changes `ios/`, and
on pull requests from other branches. It first runs `scripts/precheck.py` on Linux (about 15
seconds), then on macOS builds the app and runs the unit tests on the newest iPhone simulator.
DerivedData is cached between runs (file dates are restored from git), so a warm build and test
takes a few minutes instead of 14 (the step summary lists what took the time). A `claude/**` branch is not built again for its pull request:
the push run's result shows on the PR. The run only compiles and tests: no screenshots and no
artifact uploads (visual checks are done by hand on an iPhone). When it fails, the errors are in
the job log of the "Build and run the unit tests" step.

On demand only (Actions > iOS QA > Run workflow): **iOS QA** (`ios-qa.yml`) runs the XCUITest
walk in `KitchenTalesUITests` over every screen (over an hour). Results go to
`ios-screenshots/qa-<run>/`.

## Before pushing Swift without a Mac

Nobody here has a Mac, so the macOS job is the first compiler that sees the code. On
2026-11-10..12 almost every first run of a push failed, always on a real compile or test error.
Run `python3 ios/scripts/precheck.py` before every push (it catches 1 and 2 below), then go
through the rest by hand:

1. **Unique names.** Every non-private top-level type and every `.swift` file name must be unique
   in its target. Search before naming a new view (`grep -rn "struct StoryRow" ios/`), or make
   helper views `private`.
2. **Target membership.** A file listed for the Share extension in `project.yml` may only use
   types from files the extension also compiles, and never `UIApplication.shared`.
3. **Small expressions in views.** Keep string building out of view builders: no ternaries or
   nested interpolations inside `Text("…\(…)…")`, no `[a, b].compactMap{}.joined()` inline in an
   initializer argument. Move them into a `static func … -> String`. Split a view body over ~60
   lines into subviews. Give closures and generic views explicit types when they return
   different views (`AnyView`, `@ViewBuilder`, or a stored height) so nothing has to be inferred.
4. **Swift 6 concurrency.** `SWIFT_VERSION` is 6.0 with strict checking. Types that touch UI
   or shared state are `@MainActor`. A `static let` used off the main actor must be `Sendable`
   and outside a `@MainActor` type. Do not send non-Sendable values (`NSItemProvider`, closures)
   into a `Task` or across actors: do the work on the main actor or copy the value first.
5. **Tests.** When a change alters user-visible text or rules, update the expected values in
   `KitchenTalesTests` in the same commit, and check them against the web app's logic.
6. **Wait for green.** Push, wait for the iOS run on the branch to pass, and only then open the
   pull request or report the work as done.

## TestFlight

`.github/workflows/testflight.yml` archives the app, signs it and uploads it to TestFlight
whenever a change to `ios/` reaches `main` (or by hand: Actions › TestFlight › Run workflow).
Signing is cloud-managed: Xcode uses the App Store Connect API key to get the distribution
certificate and profile, so no certificates live in the repo. Without the four secrets the job
skips with a warning.

One-time setup in App Store Connect:

1. Accept the agreements, then *Apps › + › New App*: platform iOS, name "Bucătăria cu povești",
   bundle ID `app.kitchentales.ios` (register it first under developer.apple.com › Identifiers
   if it is not offered), SKU e.g. `kitchentales`.
2. *Users and Access › Integrations › App Store Connect API › Team Keys › +*, role **Admin**
   (needed for cloud-managed certificates). Download the `.p8` (only possible once).
3. In GitHub, *Settings › Secrets and variables › Actions*: `ASC_KEY_ID`, `ASC_ISSUER_ID`,
   `ASC_KEY_P8` (the whole file), `APPLE_TEAM_ID`.
4. *TestFlight › Internal Testing*: add a group with Sorin and Lori; both install TestFlight.

## Sign-in

The app talks to the same Cognito user pool as the web app, directly over its JSON API (no AWS
SDK, which would add minutes to every CI build). It signs in with SRP like Amplify does, so the
password never leaves the phone, handles the first sign-in with an invitation's temporary
password (NEW_PASSWORD_REQUIRED) and "Ai uitat parola?" (code by e-mail). Tokens are kept in the
Keychain and refreshed when they expire; without internet the saved session keeps the app open.
The family space comes from the `space-<id>` Cognito group, as on the web.

`KitchenTales/Resources/AuthConfig.json` holds the `auth` part of Amplify's
`amplify_outputs.json` (region, user pool ID, app client ID). These are public identifiers.
They point at the family user pool (`eu-central-1_mH3Vk6Rfm`) and its single app client, the one the web app uses (SRP and refresh flows, no client secret).

The SRP unit tests use vectors from `scripts/srp-vectors.py`, a Python reference checked
against pycognito.

## Siri, Shortcuts and Spotlight

`Features/Shortcuts/` holds App Intents: play a story (by name or the one started last), add to
the shopping list, read the list, "ce gătim azi", open the list. They show in the Shortcuts app
under Bucătăria and can go on the Action button or the Lock Screen. Siri has no Romanian voice,
so each phrase also exists in English; a Shortcut you name yourself ("Poveste de seară") works
with any Siri language. Stories and recipes are indexed in Spotlight after each refresh and the
index is cleared on sign-out. Actions that open a screen go through `AppCommands`, handled in
`SignedInRoot`.

## Share extension

`ShareExtension/` is "Salvează în Bucătăria" in the Share sheet (target `KitchenTalesShare`). It
reads a link, text or photo, runs the same `startImportRecipe` job as the editor and shows the card
from `Features/ShareIn/ShareCard.swift`, which the app also compiles (screens `-screen share-*`).
The sign-in is shared through the Keychain group `$(AppIdentifierPrefix)app.kitchentales.shared`
(both targets' entitlements). "Gata, lucrează în fundal" leaves the job in `PendingImports`; the
app saves it the next time it becomes active. A link with no recipe can be kept as a recipe in the
category "De încercat", and the server gives that AI use back (`refundAi`).

## Ora de culcare

`Features/Bedtime/`: settings per phone (Profil › Copilul › Ora de culcare), weekly local
notifications with "Începe acum" / "Peste 10 min" (`NotificationRouter`), the night screen
(`BedtimeNightView`: steps, tonight's stories, kid mode, dimmed screen), the Siri intent and a
Sleep Focus filter (`BedtimeFocusFilter`). Story jobs ask for background time and post "Povestea
e gata" when they finish while the app is in the background.
