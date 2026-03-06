# SYSTEMS.md — Active Automations

This file is the source of truth for everything I've set up. Read this on startup.
If a cron job listed here is missing from live cron, recreate it immediately.

---

## 1. Daily Morning Summary
- **Cron ID:** b76d5e8e-7c5c-40fb-87b5-1f426a08a2e6
- **Schedule:** 6:00 AM daily (Australia/Perth)
- **What it does:** Sends Petar a morning brief via Telegram — Perth weather (BOM), calendar events, important emails, 2 world headlines, 2-3 micro SaaS ideas
- **Delivers to:** Telegram 5897115037
- **Status:** ✅ Active

---

## 2. Meeting Alert — iMessage Ellen
- **Cron ID:** 42b2fa9f-bf2f-48ad-a58c-4206e9048524
- **Schedule:** Every minute (*/1 * * * *)
- **What it does:** Checks calendar for upcoming video calls (Zoom/Teams/Meet/Webex), messages Ellen via iMessage ~12-18 min before. Creative/varied templates, signed "xo Mia"
- **Script:** ~/clawd/scripts/meeting-alert.sh
- **State file:** ~/clawd/scripts/.meeting-alert-state.json
- **Status:** ✅ Active

---

## 3. OpenClaw Update Check — Daily
- **Cron ID:** 0d45117f-5da6-4208-8362-2a97631de87e
- **Schedule:** 3:00 AM daily
- **What it does:** Checks current vs latest `openclaw` npm version. If security update found → updates immediately any day. If only bug fixes/features → only updates on Mondays. Silent if already up to date.
- **Status:** ✅ Active (updated from clawdbot → openclaw 2026-03-03)

---

## 4. Indonesia Arrival Card Reminder
- **Cron ID:** 28500056-99e6-4fb2-8ad3-a569fe46dc7e
- **Schedule:** 9:00 AM, 14 March 2026
- **What it does:** Reminds Petar to fill out Indonesia e-arrival card (travel is March 17). Need: AirAsia flight number (PER→DPS, code D7 or QZ) + Maya Ubud official hotel name
- **Passports:** see memory/passports.md
- **Status:** ✅ Active (one-shot)

---

## 5. Sunday Night Grocery Automation
- **Cron ID (Phase 1 — 7pm generate):** e607323c-e359-4ae4-a631-643107347071
- **Cron ID (Phase 2 — 9pm deadline):** c5fa1fbe-153f-4e5f-8996-3e63bfe698c5
- **Schedule:** Phase 1: Sunday 7:00 PM | Phase 2: Sunday 9:00 PM (Australia/Perth)
- **Script:** ~/clawd/scripts/grocery-automation.js
- **State file:** ~/clawd/scripts/.grocery-state.json
- **Handler docs:** ~/clawd/GROCERY_HANDLER.md
- **What it does:**
  1. 7pm: Build grocery list (staples + Ellen's pending list + smart protein + specials-only items)
  2. Telegram Ellen the dot-point list, ask for tweaks or "order it"
  3. Ellen replies → update list and confirm, or "order it" → place order immediately
  4. 9pm: If Ellen hasn't responded, auto-place the order anyway
  5. Browser-automates Woolworths (clawd profile): login → add items → cheapest Monday delivery → checkout
  6. Confirms back to Ellen AND Petar with order number + total
- **Smart rules:**
  - Cat food, laundry sheets, Sukin 1L body wash: ONLY if on special
  - Sukin: 1L body wash ONLY — never shampoo or conditioner
  - Protein: if chicken breast >$22/kg, suggest turkey wings or lean beef
  - Avoid highly processed products
  - Delivery: aim $2 slot, avoid $15 express, fallback to Tuesday if needed
- **Woolworths account:** eceklic@gmail.com / password in ~/.env as WOOLWORTHS_PASSWORD
- **Delivery address:** 22 Franklin St, Leederville WA 6097
- **Status:** ❌ Deleted (2026-03-03 — Petar removed, do not recreate)

---

## 6. Grocery Reminders (OLD — replaced by #5)
- **Cron ID:** 2948aeb4-8fa4-46e0-a11c-6b9de07a77fa ← DELETED, do not recreate
- **Was:** Mon/Wed/Fri 4:30 PM reminders to Petar to do groceries
- **Replaced by:** Sunday night full automation (#5 above)

---

## 7. SaaS Ideas War Room
- **URL:** http://192.168.68.63:3002 (also localhost:3002)
- **Location:** ~/clawd/war-room/
- **Ideas data:** ~/clawd/ideas.json
- **What it is:** Full web app dashboard Mia built — tracks SaaS ideas, active projects, infrastructure, cron jobs, API usage stats
- **How to update:** Edit ideas.json directly to add/update ideas
- **Rule:** Any time Petar mentions or reacts to an idea, add it to ideas.json immediately
- **Status:** ✅ Running

---

## 8. LinkedIn Posta — Mon/Wed/Fri
- **Cron ID:** 637b3b53-d9c8-43a8-ae79-6b93205beff0
- **Schedule:** 10:00 AM Monday, Wednesday, Friday (Australia/Perth)
- **What it does:** Searches for big AI/robotics/tech/design news (last 48h), generates 3 LinkedIn post ideas (one per pillar: client attraction, design/AI, opinion/commentary). Each idea includes a punchy title + draft opening paragraph in Petar's voice. Delivers to Telegram.
- **Context file:** ~/clawd/linkedin-context.md (post style, top performers, positioning, 3 pillars)
- **Pillars:** 🎯 Client Attraction | 🤖 Design/AI&Tech | 💬 Opinion/Commentary
- **Key rules:** Always apply design lens to news; only surface genuinely big AI/tech stories; Petar picks one and writes it himself
- **Status:** ✅ Active

---

---

## 9. IB Gateway Watchdog
- **Cron ID (4:30 AM):** 032bf327-631b-45e1-a665-6c4b4da9d0eb
- **Cron ID (6:30 AM pre-ASX):** f441c0d6-2eb6-48c7-9619-0cda2acc420b
- **Cron ID (7–1 PM every 15min, trading hours):** f0acc338-41eb-45c6-8af3-85d7350b7b4b
- **Cron ID (12:00 PM):** 1de032b7-77aa-43c0-b6eb-abef69ccb31b
- **Schedule:** 4:30 AM, 6:30 AM (pre-ASX), every 15 min 7 AM–1 PM (trading hours), 12 PM AWST — Monday–Friday
- **Script:** ~/clawd/scripts/ib-gateway-watchdog.sh
- **IBC start script:** ~/ibc/start-gateway.sh (IBC installed at ~/ibc/)
- **IBC config:** ~/ibc/config.ini (credentials + TradingMode=paper + port 4002 override)
- **IB Gateway app:** ~/Applications/IB Gateway 10.44/IB Gateway 10.44.app
- **What it does:** Checks IB Gateway process + port 4002. If either fails, restarts via **IBC (Interactive Brokers Controller)** which handles headless auto-login at the Java level — no AppleScript, no screen dependency, works on locked/headless display. Sends Telegram alert on restart or failure. Silent if healthy.
- **Notifications:** Telegram (native — no extra dependencies)
- **IB credentials:** `IB_GATEWAY_USERNAME` / `IB_GATEWAY_PASSWORD` in `~/.env` (also in ~/ibc/config.ini)
- **Rules:** Does NOT interact with IB API beyond connectivity check. Does NOT touch ~/possum_au/ or run any trading scripts.
- **Status:** ✅ Active (IBC headless login — tested working 2026-03-03)

---

## 10a. Possum Crypto Trading Bot
- **Location:** ~/clawd/trading-bot-possum-crypto/
- **Schedule:** Every 4 hours (cron via LaunchAgent or script)
- **Market:** BTC/AUD, ETH/AUD, SOL/AUD (Kraken)
- **What it does:** Mean-reversion crypto bot. Active variants: MR1, MR2, MR3. Tracks Fear & Greed Index for regime. Currently dry run.
- **Logs:** ~/clawd/trading-bot-possum-crypto/logs/
- **DB:** ~/clawd/trading-bot-possum-crypto/possum_crypto.db
- **Status:** ✅ Active (dry run)

---

## 10b. Possum PM (Polymarket Prediction Bot)
- **Location:** ~/clawd/trading-bot-possum-pm/
- **Schedule:** Every 6 hours
- **What it does:** Scans Polymarket/Manifold for mispriced prediction markets using GDELT news velocity + Grok analysis. Papers trades when gap found.
- **Active contracts:** iran-strike-2026, ukraine-ceasefire-2026, greenland-acquisition-2026
- **Logs:** ~/clawd/trading-bot-possum-pm/logs/
- **DB:** ~/clawd/trading-bot-possum-pm/possum_pm.db
- **Status:** ✅ Active (paper signals)

---

## 10. Possum AU Trading Bot (ASX)
- **LaunchAgent (trader):** com.possum.au.trader — 6:45 AM AWST daily
- **LaunchAgent (crossfeed):** com.possum.au.crossfeed — 6:00 AM AWST daily
- **Location:** ~/clawd/trading-bot-possum-au/
- **Market:** ASX equities (21 stocks: ANZ, BHP, CBA, CSL, XRO, WES, WOW, etc.)
- **What it does:** Overnight analysis cycle before ASX open. 14 strategy variants (V1–V14). Reads cross-feed from Possum US. Paper trading on IBKR (port 4002 = IB Gateway paper, headless via IBC).
- **Status command:** `python3 ~/clawd/trading-bot-possum-au/main.py --status`
- **Health command:** `python3 ~/clawd/trading-bot-possum-au/main.py --health`
- **Logs:** ~/clawd/trading-bot-possum-au/logs/
- **DB:** ~/clawd/trading-bot-possum-au/possum_au.db
- **Included in:** Daily morning briefing (🦘 Possum AU section)
- **Status:** ✅ Active (paper trading)

---

## 11. Ring Camera — Late Night Monitor
- **Cron ID:** 2d5b22a7-237a-4613-823e-61a79ca60809
- **Schedule:** Every 5 min, 11 PM – 4:55 AM (Australia/Perth)
- **Script:** ~/clawd/scripts/ring-monitor.py
- **Token file:** ~/.ring_token.json (auto-refreshes)
- **State file:** ~/clawd/scripts/.ring-monitor-state.json
- **Cameras:** All 6 Ring devices (Front Door x2, Porch, Driveway, Front x2)
- **What it does:** Polls Ring API for new motion/person events during overnight hours. Sends Telegram alert directly if any found. Silent otherwise. 2FA already completed — token persists.
- **Status:** ✅ Active

---

## 12. AirTouch 5 — Auto-off at 5 AM
- **Cron ID:** 49af1267-8819-4f0b-8aff-f37545fd3715
- **Schedule:** 5:00 AM daily (Australia/Perth)
- **Script:** ~/clawd/scripts/airtouch-off.py
- **Device:** AirTouch 5 @ 192.168.68.88 (console ID: AT5C202405000322)
- **Zones:** Family Area, Master Bed, Gaystation, Ozren, Filip
- **What it does:** Turns off the MHI AC unit silently every morning. If already off, does nothing. If script fails, alerts Petar via Telegram.
- **Status:** ✅ Active

---

## 13. Sanitize Sessions — Nightly
- **Cron ID:** 5efb3223-d3a4-42db-930a-04cc30499ba7
- **Schedule:** 2:00 AM daily (Australia/Perth)
- **Script:** ~/clawd/scripts/sanitize-sessions.sh
- **What it does:** Strips thinking/redacted_thinking blocks from all openclaw session transcripts. Prevents transcript corruption after version upgrades. Silent if clean; alerts Petar on error.
- **Status:** ✅ Active (added 2026-03-03)

---

## 14. Backup Sessions to GitHub — Nightly
- **Cron ID:** 760127cd-ca84-42e8-9cce-62475167c4f6
- **Schedule:** 3:30 AM daily (Australia/Perth) — runs after sanitize (#13)
- **Script:** ~/clawd/scripts/backup-sessions.sh
- **What it does:** Backs up last 7 days of sessions + memory files to GitHub (petarceklic/Clawdbot). 7-day retention to avoid repo bloat. Silent if clean; alerts Petar on error.
- **Status:** ✅ Active (added 2026-03-03)

---

## 15. Weekly Site Monitor
- **Cron ID:** a4983116-67c9-480c-b907-0daefcb6fc1e
- **Schedule:** 9:00 AM every Monday (Australia/Perth)
- **What it does:** Weekly check across Petar's sites (GA, Search Console, etc.)
- **Status:** ✅ Active

---

## 16. Travelabindex SC Follow-up (One-shot)
- **Cron ID:** 081276fb-105d-45eb-95d7-5e34cfac6fb6
- **Schedule:** 9:00 AM, 6 March 2026 (one-shot)
- **What it does:** Search Console follow-up task for travelabindex.com
- **Status:** ✅ Scheduled (fires in ~2 days)

---

## Notes
- Always write new automations here before AND after setting them up
- If a cron ID is missing from live cron list, recreate it using the spec above
- Woolworths browser session persists for weeks once authenticated (clawd browser profile)
