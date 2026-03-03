# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Contacts

- **Ellen Ceklic** (Petar's wife) — +61411315424 (iMessage) | Telegram ID: 8680578395 (@username unknown)

---

## Sensibo (Air Con)
- **API Key:** stored in `~/.env` as `SENSIBO_API_KEY`
- **Office pod:** ID `HxJbpzZN`
- **API base:** `https://home.sensibo.com/api/v2`
- **Turn on:** `POST /pods/HxJbpzZN/acStates?apiKey=KEY` body `{"acState":{"on":true}}`
- **Turn off:** same with `{"acState":{"on":false}}`
- **Change temp:** `{"acState":{"on":true,"targetTemperature":24}}`

---

## Philips Hue
- **Bridge IP:** 192.168.68.50
- **API Key:** stored in `~/.env` as `HUE_API_KEY`
- **API base:** `http://192.168.68.50/api/$HUE_API_KEY`

### Rooms (group IDs)
| ID | Room | Lights |
|----|------|--------|
| 1 | Lounge | 24 (gradient strip), 17 (Bloom 2), 14 (Bloom), 3 (colour lamp) |
| 2 | Bedroom | 5 (white lamp), 23 (lightstrip), 22, 21 |
| 3 | Kitchen | 6 (lightstrip low), 9, 7, 13 (filaments) |
| 5 | Backyard | 15 (outdoor strip) |
| 7 | Office Pod | 4, 20 (both off) |
| 8 | Ellen office | 18 (lightstrip plus) |
| 82 | Sunroom | 1 (lightstrip) |

### Quick commands (shell)
```bash
HUE="http://192.168.68.50/api/tsuYGbvFDS1ul3ZLV9PsT94aCmYVspJyM9k1svfc"
# Turn room on/off: PUT /groups/{id}/action {"on": true}
# Set brightness: {"on": true, "bri": 128}  (0-254)
# Set colour (hue/sat): {"on": true, "hue": 46920, "sat": 254, "bri": 200}
# Set colour temp: {"on": true, "ct": 370}  (153=cool, 500=warm)
# All lights off: PUT /groups/0/action {"on": false}
```

---

Add whatever helps you do your job. This is your cheat sheet.
