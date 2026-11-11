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
shot 2-recipes -demo YES -tab recipes
shot 3-profile -demo YES -tab profile
shot 4-catalog -demo YES -tab profile -screen catalog
