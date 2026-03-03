#!/usr/bin/env bash
# IB Gateway Watchdog — IBC Edition
# Uses IBC (Interactive Brokers Controller) for headless auto-login.
# No AppleScript, no screen dependency. Works on locked/headless display.

set -euo pipefail

PORT=4002
IBC_START=~/ibc/start-gateway.sh
PORT_WAIT=90   # IBC needs time to load IB Gateway + auto-login

check_process() {
  pgrep -f "IB Gateway 10.44" > /dev/null 2>&1
}

check_port() {
  nc -z localhost "$PORT" > /dev/null 2>&1
}

is_healthy() {
  check_process && check_port
}

echo "[watchdog] $(date): Starting IB Gateway health check"

if is_healthy; then
  echo "HEALTHY: IB Gateway is running and port $PORT is responding."
  exit 0
fi

echo "[watchdog] IB Gateway appears down. Starting via IBC..."

if [[ ! -f "$IBC_START" ]]; then
  echo "ALERT: IBC start script not found at '$IBC_START'. Manual intervention needed."
  exit 1
fi

# Kill any stuck IB Gateway process first
pkill -f "IB Gateway 10.44" 2>/dev/null || true
pkill -f "IBC.jar" 2>/dev/null || true
sleep 3

# Launch IBC fully daemonized — detached from this session
nohup bash "$IBC_START" > ~/ibc/logs/ibc-daemon.log 2>&1 &
IBC_PID=$!
disown $IBC_PID
echo "[watchdog] IBC launched (PID $IBC_PID). Waiting up to ${PORT_WAIT}s for port ${PORT}..."

waited=0
while [[ $waited -lt $PORT_WAIT ]]; do
  sleep 5
  waited=$((waited + 5))
  if check_port; then
    echo "[watchdog] Port ${PORT} is open after ${waited}s."
    echo "RESTARTED: IB Gateway was down and has been restarted + logged in via IBC."
    exit 0
  fi
  echo "[watchdog] Still waiting... (${waited}s / ${PORT_WAIT}s)"
done

echo "FAILED: IB Gateway did not come up after ${PORT_WAIT}s. Manual intervention needed."
exit 1
