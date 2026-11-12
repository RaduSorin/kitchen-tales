#!/bin/bash
# Installs the simulator build and saves a screenshot of each screen into $OUT (default
# build/screenshots). Usage: screenshots.sh <path to KitchenTales.app> <simulator UDID>
set -euo pipefail

APP="$1"
UDID="$2"
OUT="${OUT:-build/screenshots}"
BUNDLE_ID="app.kitchentales.ios"
mkdir -p "$OUT"

xcrun simctl bootstatus "$UDID" -b >/dev/null
# A clean status bar (9:41, full battery), like Apple's marketing shots.
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 || true
xcrun simctl install "$UDID" "$APP"

shot() {
  local name="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" "$@" >/dev/null
  sleep 4
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$name.png" >/dev/null
  echo "saved $OUT/$name.png"
}

# Signed out (no session in a fresh simulator): the login sheet and its steps.
shot 0a-login
shot 0b-login-new-password -screen login-new-password
shot 0c-login-code -screen login-code
# Signed in with a made-up account (-demo, debug builds only).
shot 1-home -demo YES -tab home
shot 1b-home-week -demo YES -tab home -screen home-week
shot 1c-home-caiet -demo YES -tab home -screen home-caiet
shot 2-recipes -demo YES -tab recipes
shot 2b-recipe -demo YES -tab home -screen recipe
shot 2b2-recipe-steps -demo YES -tab home -screen recipe-steps
shot 2b3-recipe-notes -demo YES -tab home -screen recipe-notes
shot 2b4-recipe-facts -demo YES -tab home -screen recipe-facts
shot 2c-cook -demo YES -tab home -screen cook
shot 2c2-cook-ingredients -demo YES -tab home -screen cook-ingredients
shot 2d-week -demo YES -tab week
shot 2e-week-add -demo YES -tab week -screen week-add
shot 2e2-week-plan -demo YES -tab week -screen plan-week
shot 2e3-week-plan-result -demo YES -tab week -screen plan-week-result
shot 2f-list -demo YES -tab list
shot 2f2-list-recipes -demo YES -tab list -kt-shopping-by-recipe YES
shot 2g-editor-new -demo YES -tab recipes -screen editor-new
shot 2h-editor-paste -demo YES -tab recipes -screen editor-paste
shot 2i-editor-ai -demo YES -tab recipes -screen editor-ai
shot 2j-editor-ideas -demo YES -tab recipes -screen editor-ideas
shot 2k-editor-details -demo YES -tab recipes -screen editor-edit
shot 2l-editor-ingredients -demo YES -tab recipes -screen editor-ingredients
shot 2m-editor-steps -demo YES -tab recipes -screen editor-steps
shot 2n-recipe-delete -demo YES -tab home -screen recipe-delete
shot 3-profile -demo YES -tab profile
shot 3b-profile-child -demo YES -tab profile -screen profile-child
shot 3c-profile-family -demo YES -tab profile -screen profile-family
shot 3d-profile-invite -demo YES -tab profile -screen profile-invite
shot 3e-profile-prefs -demo YES -tab profile -screen profile-prefs
shot 3f-kid-mode -demo YES -area stories -tab home -screen kid
shot 4-catalog -demo YES -tab profile -screen catalog
# Stories side (made-up library, drawn covers).
shot 5-stories-home -demo YES -area stories -tab home
shot 5b-stories-colectii -demo YES -area stories -tab home -screen stories-colectii
shot 5c-stories-favorite -demo YES -area stories -tab home -screen stories-favorite
shot 6a-stories-library -demo YES -area stories -tab library
shot 6b-stories-shelf -demo YES -area stories -tab library -screen folder -folder-look Raft
shot 6c-stories-cover-flow -demo YES -area stories -tab library -screen folder -folder-look "Cover Flow"
shot 6d-stories-folder -demo YES -area stories -tab library -screen folder -folder-look "Listă"
shot 7-stories-favorites -demo YES -area stories -tab favorites
shot 8-stories-mini-player -demo YES -area stories -tab library -screen mini-player
shot 9-stories-player -demo YES -area stories -tab home -screen player
shot 9b-story-move -demo YES -area stories -tab home -screen story-move
shot 9c-story-move-new -demo YES -area stories -tab home -screen story-move-new
shot 9d-story-text -demo YES -area stories -tab home -screen story-text
shot 9e-story-delete -demo YES -area stories -tab home -screen story-delete
shot 9f-story-cover -demo YES -area stories -tab home -screen story-cover
shot 9g-story-voice -demo YES -area stories -tab home -screen story-voice
shot 9h-player-goodnight -demo YES -area stories -tab home -screen player-goodnight
shot 6e-folder-new -demo YES -area stories -tab library -screen folder-new
shot 6f-folder-squares -demo YES -area stories -tab library -screen folder -folder-look "Pătrate"
shot 6g-folder-share -demo YES -area stories -tab library -screen folder-share
shot 6h-folder-edit -demo YES -area stories -tab library -screen folder-edit
shot 6i-folder-delete -demo YES -area stories -tab library -screen folder-delete
shot 10-stories-profile -demo YES -area stories -tab profile
shot 11a-add -demo YES -area stories -tab add
shot 11b-add-create -demo YES -area stories -tab add -screen add-create
shot 11c-add-record -demo YES -area stories -tab add -screen add-record
shot 11d-add-finish -demo YES -area stories -tab add -screen add-finish
shot 11e-add-upload -demo YES -area stories -tab add -screen add-upload
