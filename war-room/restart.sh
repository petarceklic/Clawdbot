#!/bin/bash
# War Room — clean restart script
# Uses PID file + port check to avoid EADDRINUSE
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.war-room.pid"
PORT=3002

echo "$(date '+%Y-%m-%d %H:%M:%S') — War Room restart requested"

# 1. Kill via PID file (graceful SIGTERM first)
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Sending SIGTERM to PID $OLD_PID"
    kill "$OLD_PID"
    # Wait up to 5s for graceful shutdown
    for i in $(seq 1 10); do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.5
    done
    # Force kill if still alive
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Force killing PID $OLD_PID"
      kill -9 "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "$PID_FILE"
fi

# 2. Fallback: kill anything on port 3002
PIDS=$(lsof -i :$PORT -t 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Killing remaining processes on port $PORT: $PIDS"
  echo "$PIDS" | xargs kill 2>/dev/null || true
  sleep 2
  # Force kill if needed
  PIDS=$(lsof -i :$PORT -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

# 3. Start fresh
cd "$DIR"
nohup node server.js >> "$DIR/war-room.log" 2>&1 &
NEW_PID=$!
echo "War Room started (PID $NEW_PID)"

# 4. Verify
sleep 2
if curl -sf -o /dev/null http://localhost:$PORT; then
  echo "✅ War Room responding on port $PORT"
else
  echo "⚠️  War Room may still be starting (check logs)"
fi
