#!/bin/bash
# Possum PM -- Prediction market scanner
# Called by launchd every 6 hours (geopolitical events move slowly)
#
# Schedule (AWST UTC+8): 00:00, 06:00, 12:00, 18:00
# Each run downloads ~6h of GDELT GKG files, builds velocity baseline,
# checks Manifold/Polymarket gaps, calls Grok on triggers.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Possum PM pipeline starting" >> "$LOG_DIR/runner.log"

# Run the pipeline once
/opt/homebrew/bin/python3 main.py --once >> "$LOG_DIR/analysis.log" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Possum PM pipeline complete" >> "$LOG_DIR/runner.log"
