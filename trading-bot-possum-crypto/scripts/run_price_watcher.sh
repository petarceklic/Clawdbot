#!/bin/bash
# Possum Crypto -- Price watcher (lightweight position monitor)
# Called by launchd every 15 minutes
# Only fetches prices and checks stops/TPs -- no Grok, no regime filter

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Price watcher starting" >> "$LOG_DIR/runner.log"

# Python script logs to price_watcher.log via its own FileHandler.
# stdout/stderr go to launchd's watcher_stdout/stderr.log (or terminal if run directly).
/opt/homebrew/bin/python3 price_watcher.py

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Price watcher complete" >> "$LOG_DIR/runner.log"
