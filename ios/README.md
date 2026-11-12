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
| `scripts` | Simulator picking and screenshots for CI |

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

Each pull request that changes `ios/` builds the app, runs the unit tests on the newest iPhone
simulator and takes screenshots of the main screens: they are uploaded as the artifact
`ios-screenshots` and committed to the `ios-screenshots` branch under `pr-<number>/`. The `testflight-readiness` job reports which App Store Connect secrets are set
(`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`), never their values.

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
