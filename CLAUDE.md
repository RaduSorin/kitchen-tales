# Notes for Claude

- Docs, code comments, commit messages and pull requests are in English. Sorin writes in
  Romanian; the app's UI text is Romanian.
- The web app (`src/`, `amplify/`) has its own check: `npx tsc -b`, `npx oxlint`, `npm test`,
  `npx vite build` (see `.github/workflows/check.yml`).

## Native iOS app (`ios/`)

There is no Mac and no Swift compiler in a Claude session: the macOS job in
`.github/workflows/ios.yml` is the first compiler that sees the code. So:

1. Before every push that touches `ios/`, run `python3 ios/scripts/precheck.py` and go through
   the checklist in [`ios/README.md`](ios/README.md#before-pushing-swift-without-a-mac).
2. Push to your `claude/**` branch. The iOS workflow runs on that push.
3. Wait for that run to pass before you open the pull request or tell Sorin the work is done.
   If it fails, read the errors with the GitHub job logs, fix them in a focused commit, and
   push again. A red run is for you to fix, not for Sorin to see.
