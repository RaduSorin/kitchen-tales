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
