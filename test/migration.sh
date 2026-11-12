#!/usr/bin/env bash
# Verifies first-launch migration from the old "Gon Journal" data folder (Linux paths; same code on Win/Mac).
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d); mkdir -p "$T/Gon Journal/screenshots"
echo '[{"id":"legacy-1","date":"2026-11-01","instrument":"MNQ","direction":"long","resultR":2,"screenshots":[],"createdAt":1}]' > "$T/Gon Journal/logs.json"
echo '{"bearerToken":"LEGACY"}' > "$T/Gon Journal/settings.json"
XDG_CONFIG_HOME=$T GON_TAB=home GON_NO_POLL=1 GON_SHOT=$T/shot.png GON_SHOT_DELAY=300 timeout 60 xvfb-run -a ./node_modules/.bin/electron . --no-sandbox --disable-gpu >/dev/null 2>&1 || true
if grep -q legacy-1 "$T/Cole's Journal/logs.json" && grep -q LEGACY "$T/Cole's Journal/settings.json" && [ -f "$T/Gon Journal/logs.json" ]; then echo "migration OK"; else echo "migration FAILED"; ls -la "$T"; exit 1; fi
