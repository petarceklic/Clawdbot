#!/bin/bash
# Possum Crypto -- Main analysis runner
# Called by launchd every 4 hours (crypto trades 24/7)
#
# Schedule (AWST UTC+8): 00:00, 04:00, 08:00, 12:00, 16:00, 20:00

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Possum Crypto analysis starting" >> "$LOG_DIR/runner.log"

# Run one analysis cycle (dry-run by default, controlled by config.py)
/opt/homebrew/bin/python3 main.py --once >> "$LOG_DIR/analysis.log" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') -- Possum Crypto analysis complete" >> "$LOG_DIR/runner.log"
