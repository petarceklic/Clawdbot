#!/usr/bin/env python3
"""
Ring camera late-night monitor.
Checks for person/motion events between 11 PM – 5 AM Perth time.
Sends Telegram alert if a new event is found since last check.
"""
import json, asyncio, os, sys, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone
import pytz

TOKEN_FILE = Path.home() / ".ring_token.json"
STATE_FILE = Path.home() / "clawd/scripts/.ring-monitor-state.json"
USER_AGENT = "clawd-ring-monitor/1.0"

PERTH_TZ   = pytz.timezone("Australia/Perth")
WATCH_START = 23   # 11 PM
WATCH_END   = 5    # 5 AM

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT  = "5897115037"

# Location labels
LOCATIONS = {
    "02a4d6e0-bde4-4ee7-90a7-5b7edb7d0273": "🏠 Leederville",
    "dab6a6a3-4c71-4b26-96b8-b47331b6ab2e": "👴 Mount Lawley (FIL)",
}

def is_watch_hours(dt_utc):
    """Return True if dt_utc falls within 11 PM – 5 AM Perth time."""
    dt_perth = dt_utc.astimezone(PERTH_TZ)
    h = dt_perth.hour
    return h >= WATCH_START or h < WATCH_END

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"seen_ids": []}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))

def send_telegram(message):
    if not TELEGRAM_TOKEN:
        print(f"[ring-monitor] No TELEGRAM_BOT_TOKEN — would send: {message}")
        return
    data = urllib.parse.urlencode({
        "chat_id": TELEGRAM_CHAT,
        "text": message,
        "parse_mode": "HTML"
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        data=data
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[ring-monitor] Telegram send failed: {e}")

def token_updated(token):
    TOKEN_FILE.write_text(json.dumps(token))

async def check():
    from ring_doorbell import Ring, Auth

    token = json.loads(TOKEN_FILE.read_text())
    auth = Auth(USER_AGENT, token, token_updated)
    ring = Ring(auth)
    await ring.async_update_data()

    state   = load_state()
    seen    = set(state.get("seen_ids", []))
    alerts  = []
    new_ids = []

    for device in ring.video_devices():
        device_loc = (device._attrs if hasattr(device, '_attrs') else {}).get('location_id', '')
        loc_label = LOCATIONS.get(device_loc, f"📍 Unknown ({device_loc[:8]})")
        try:
            events = await device.async_history(limit=20)
        except Exception as e:
            print(f"[ring-monitor] Error fetching {device.name}: {e}")
            continue

        for evt in events:
            eid  = str(evt.get("id", ""))
            kind = evt.get("kind", "")
            created_raw = evt.get("created_at")

            if not eid or eid in seen:
                continue

            new_ids.append(eid)

            # Parse timestamp
            if isinstance(created_raw, datetime):
                dt_utc = created_raw if created_raw.tzinfo else created_raw.replace(tzinfo=timezone.utc)
            elif isinstance(created_raw, str):
                dt_utc = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            else:
                continue

            # Only alert during watch hours
            if not is_watch_hours(dt_utc):
                continue

            # Only alert for person detections via cv_properties
            cv = evt.get("cv_properties") or {}
            detected_types = [d.get("detection_type") for d in (cv.get("detection_types") or [])]
            is_person = (
                cv.get("person_detected") is True
                or cv.get("detection_type") == "person"
                or "person" in detected_types
                or kind == "person"  # fallback for ding-type events
            )
            if not is_person:
                continue

            dt_perth = dt_utc.astimezone(PERTH_TZ)
            time_str = dt_perth.strftime("%I:%M %p")
            alerts.append(f"🚶 <b>{device.name}</b> — person detected at {time_str} (Perth)\n   {loc_label}")

    # Update seen IDs (keep last 200)
    all_ids = list(seen) + new_ids
    state["seen_ids"] = all_ids[-200:]
    save_state(state)

    if alerts:
        msg = "🌙 <b>Ring Alert — Late Night Activity</b>\n\n" + "\n".join(alerts)
        print(f"[ring-monitor] Sending alert:\n{msg}")
        send_telegram(msg)
    else:
        print(f"[ring-monitor] {datetime.now().strftime('%H:%M')} — No new late-night events.")

if __name__ == "__main__":
    # Load .env for TELEGRAM_BOT_TOKEN
    env_file = Path.home() / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

    asyncio.run(check())
