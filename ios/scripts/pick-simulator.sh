#!/bin/bash
# Prints the UDID of an available iPhone simulator on the newest iOS runtime, preferring a Pro
# model (the closest to Sorin's and Lori's phones). Creates nothing. With IOS_MAJOR set (for
# example 18), only runtimes of that iOS version are considered.
set -euo pipefail
xcrun simctl list devices available -j | python3 -c '
import json, os, re, sys
data = json.load(sys.stdin)["devices"]
def version(runtime):
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
best = None
for runtime, devices in data.items():
    if "iOS" not in runtime:
        continue
    if os.environ.get("IOS_MAJOR") and version(runtime)[0] != int(os.environ["IOS_MAJOR"]):
        continue
    for d in devices:
        if not d["name"].startswith("iPhone"):
            continue
        score = (version(runtime), " Pro" in d["name"] and "Max" not in d["name"], d["name"])
        if best is None or score > best[0]:
            best = (score, d["udid"], d["name"], runtime)
if best is None:
    sys.exit("no iPhone simulator available")
print(best[1])
print(f"{best[2]} on {best[3]}", file=sys.stderr)
'
