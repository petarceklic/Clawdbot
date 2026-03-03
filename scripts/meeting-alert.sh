#!/bin/bash
# meeting-alert.sh
# Checks for upcoming video call meetings and iMessages Ellen 15 min before

STATE_FILE="$HOME/clawd/scripts/.meeting-alert-state.json"
EVENTS_FILE="/tmp/mia-meeting-events.json"
RUNNER="$HOME/clawd/scripts/meeting-alert-runner.js"
ELLEN="+61411315424"
WINDOW_MIN=12
WINDOW_MAX=18

NOW=$(date +%s)
FROM=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TO=$(date -u -v+30M +%Y-%m-%dT%H:%M:%SZ)

# Fetch calendar events and write to temp file (avoids shell variable escaping issues)
/opt/homebrew/bin/gog calendar events \
  --account petarceklic@gmail.com \
  --from "$FROM" \
  --to "$TO" \
  --json 2>/dev/null > "$EVENTS_FILE"

if [ ! -s "$EVENTS_FILE" ]; then
  exit 0
fi

# Run the Node.js handler (separate file — no inline escaping nightmares)
STATE_FILE="$STATE_FILE" \
ELLEN="$ELLEN" \
EVENTS_FILE="$EVENTS_FILE" \
NOW="$NOW" \
WINDOW_MIN="$WINDOW_MIN" \
WINDOW_MAX="$WINDOW_MAX" \
/opt/homebrew/bin/node "$RUNNER" 2>&1
