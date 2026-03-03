# MEMORY.md — Mia's Long-Term Memory

Last updated: 2026-02-27

---

## People

### Petar Ceklic (@teknoperf)
- Product designer, 20 years exp, not a coder by trade
- Telegram ID: 5897115037
- Nickname: Peki (use sometimes in messages to Ellen)
- Building multiple SaaS projects
- Timezone: GMT+8 (Perth, Australia)
- Passport: PB5508067 (see memory/passports.md for full details)

### Ellen Ceklic (Petar's wife)
- Full name: Ellen Ceklic, nickname: Elle Bell
- iMessage: +61411315424
- Telegram ID: 8680578395 (joined 2026-02-23)
- Woolworths: eceklic@gmail.com / MOnday22 (capital O)
- Woolworths credit card Visa ending 4368, CVV: 787
- Delivery address: 22 Franklin St, Leederville WA 6097
- Passport: PB1714943 (see memory/passports.md for full details)

---

## Systems & Infrastructure

### Woolworths Grocery Automation
- Browser session persists (logged in as Ellen, clawd browser profile)
- **Woolworths uses nested shadow DOM** — wc-product-tile → wc-add-to-cart → button.add-to-cart-btn (pierce with .shadowRoot)
- Cart API: POST /api/v3/ui/trolley/update {items: [{Stockcode, Quantity}]}
- Search API: POST /apis/ui/Search/products
- CVV: 787 (Visa 4368) — in cross-origin gr4vy iframe; find CDP target with "input.html?parentOrigin" in URL, inject via nativeInputValueSetter
- **Delivery Unlimited is ACTIVE** on Ellen's account — delivery is FREE (saves $15)
- Browser act/navigate/snapshot can time out — fall back to direct CDP WebSocket Node.js scripting
- **Fruit & Veg: NO substitutions** — set "no substitute" on all produce items at checkout
- **Apples: always search "Pink Lady apples"** and verify product name before adding
- **Cosmetics specials: use Woolworths browser directly**, not third-party catalogue sites

### Ellen's Grocery Preferences
- Sukin body wash 1L ONLY when on special — never shampoo/conditioner
- Italian pasta: La Molisana or De Cecco — NOT Barilla
- Always 1L sizes for body wash etc.
- School snacks: no additive numbers, minimal ingredients, school is NOT nut-free
- Kimchi: skip if in last 2 orders
- Check actual order history before adding recurring items

### Sensibo (Air Con)
- API key: VYqiqxm5vmLBRRImJqxOKGANa636ao (in ~/.env as SENSIBO_API_KEY)
- Office pod: HxJbpzZN
- Turn on/off: POST https://home.sensibo.com/api/v2/pods/HxJbpzZN/acStates?apiKey=KEY {"acState":{"on":true/false}}

### Mac Mini Login
- User: clawd
- Password: stored in ~/.env as CLAWD_LOGIN_PASSWORD
- Useful for: unlocking screen via AppleScript, Screen Sharing, manual troubleshooting

### IB Gateway Watchdog
- Script: ~/clawd/scripts/ib-gateway-watchdog.sh
- App: ~/Applications/IB Gateway 10.44/IB Gateway 10.44.app (NOT /Applications/)
- Checks process + port 4002; restarts via **IBC (Interactive Brokers Controller)** if down
- **IBC installed at ~/ibc/** — handles headless auto-login at Java level (no AppleScript, no screen needed)
- IBC config: ~/ibc/config.ini (TradingMode=paper, port 4002, credentials stored)
- IBC start script: ~/ibc/start-gateway.sh
- IB login credentials: in ~/.env as IB_GATEWAY_USERNAME / IB_GATEWAY_PASSWORD
- Crons: 4:30 AM, 6:30 AM (pre-ASX), every 15 min 7–1 PM (trading hours), 12 PM AWST weekdays
- All cron IDs in SYSTEMS.md
- **Note:** AppleScript approach FAILED on locked screen — IBC tested working 2026-03-03

### Ring Camera Monitoring
- Script: ~/clawd/scripts/ring-monitor.py
- Token: ~/.ring_token.json (petarceklic@gmail.com, auto-refreshes)
- venv: ~/clawd/venvs/ring/
- Monitors BOTH locations: 🏠 Leederville (02a4d6e0) + 👴 Mount Lawley FIL (dab6a6a3)
- Person detection ONLY (cv_properties), 11 PM – 5 AM Perth
- Cron: 2d5b22a7 (*/5 23,0,1,2,3,4 AWST)

### Google Analytics / Search Console
- Clawd browser (clawd profile) is logged in as petarceklic@gmail.com
- Sites to monitor: petarceklic.com (GA+SC), ellenceklic.com (GA p445362232 + SC), thedatafusion.com (SC), disruptis.io (SC), travelabindex.com (SC)
- Ellen's site GA account: a317517606, property: p445362232
- Monitoring script being built: ~/clawd/scripts/site-monitor.py (sub-agent running 2026-02-27)

### War Room Dashboard
- URL: http://192.168.68.63:3002 (Mac mini LAN)
- Location: ~/clawd/war-room/server.js
- Ideas data: ~/clawd/ideas.json
- Pages: / (main), /ideas, /possum-au, /possum-us
- 🏆 Leaderboard nav link → http://192.168.68.63:8080/leaderboard (US vs AU head-to-head)
- Auto-starts via launchd
- Add ideas to ideas.json directly whenever Petar mentions one

### Meeting Alert (Ellen)
- Cron: every minute, checks calendar for video calls
- Messages Ellen via iMessage ~15 min before
- Script: ~/clawd/scripts/meeting-alert.sh
- 7 template variations, signed "xo Mia"

---

## Key Lessons Learned

- **Always memory_search before saying "I don't have that"** — CVV was in notes, still asked for it. Embarrassing.
- **Read SYSTEMS.md on startup** — forgot I built the War Room app twice
- **Product detail pages work on Woolworths; browse pages don't** (in clawd browser)
- **Cross-origin CVV iframes**: find the iframe's own DevTools target via /json, connect via WebSocket, use nativeInputValueSetter to inject value
- **Petar's feedback style**: direct, fair, won't sugarcoat when I mess up — earn trust through consistency
- **clawdbot vs openclaw**: clawdbot is the npm package we run; openclaw is the open-source GitHub repo. They have separate release schedules. npm version is the source of truth for updates.
- **LinkedIn scanning**: Petar's LinkedIn is logged in on the clawd browser profile — can access analytics, full post history, top posts dashboard at linkedin.com/analytics/creator/content/
- **IB Gateway auto-login**: AppleScript works but requires `node` in macOS Accessibility permissions. Process name in System Events is "JavaApplicationStub" (not "ibgateway"). Login screen = passkey prompt → click "Try another way" → enter credentials.
- **Clawd browser act/snapshot timeouts**: If act/snapshot fail but screenshot works, gateway restart fixes it (SIGUSR1)
- **Billing**: I run via `anthropic:claude-cli` profile with OAuth — uses Petar's Claude subscription, NOT a separate API key. No extra API fees. Config has an `api_key` profile too but it's not used for me.

---

## Travel - Bali Trip (March 2026)
- Arrival: 17 March 2026, Departure: 22 March 2026
- Hotel: Maya Ubud Resort & Spa
- Flying: AirAsia (flight not yet booked as of 2026-02-21)
- Indonesia e-arrival card: submit via allindonesia.imigrasi.go.id (3-day window opens 14 March)
- Cron reminder set for 9am 14 March 2026

---

## Petar's Projects

### Paak (iOS App) — LIVE
- Trip packing app: "Smart packing for every trip"
- App Store URL: https://apps.apple.com/au/app/paak/id6759315100
- Free, Travel category, requires iOS 26.0+, 2.7MB
- Built with Claude Code as a product designer (not a coder)
- Went live 2026-02-24

### Possum US (Trading Bot)
- Location: ~/clawd/trading-bot-possum/
- Paper trading on IBKR (port 4002 = Gateway paper), $100k starting equity
- Dashboard: http://192.168.68.63:8080/ (leaderboard at /leaderboard)
- War Room page: http://192.168.68.63:3002/possum-us
- 8 active strategy variants; uses Grok (x.ai) as primary AI, Claude fallback
- LaunchAgents auto-start on boot (trader + dashboard)
- Status included in daily morning briefing

### Possum AU (Trading Bot)
- Location: ~/clawd/trading-bot-possum-au/
- Paper trading, A$5,000 starting capital, 21 ASX stocks
- **FULLY WIRED — submits real paper orders to IBKR** (confirmed 2026-02-27)
- Execution flow: `brain/orchestrator.py` → signal above threshold → `execution/order_manager.py` → portfolio_guard → `ibkr_client.py` → bracket order → IB Gateway port 4002
- Uses SMART routing (not direct ASX — Error 10311 was fixed 2026-02-27)
- No-short guard in portfolio_guard (IBKR paper doesn't allow shorting ASX stocks)
- FMG.AX BUY: 118 shares @ ~A$21.05 confirmed accepted by IBKR (V13 pre-ex-div strategy)
- P&L shows $0 because bot disconnects after placing — fill reconciliation not yet built
- Uses Grok (x.ai) as primary AI — NOT OpenAI
- LaunchAgent runs 6:45 AM AWST daily (before ASX open at 7 AM)
- War Room page: http://192.168.68.63:3002/possum-au
- Config: port 4002 (IB Gateway paper) — same Gateway the watchdog monitors

### LinkedIn Posta
- Automated LinkedIn post idea system
- Cron: Mon/Wed/Fri 10:30am → 3 ideas delivered to Telegram
- Cron ID: 637b3b53-d9c8-43a8-ae79-6b93205beff0
- Context file: ~/clawd/linkedin-context.md
- Format: pillar label + punchy title + draft opening paragraph in his voice
- 3 pillars: Client Attraction, Design/AI&Tech, Opinion/Commentary
- Positioning: web app design for complex systems (SaaS, IoT, agtech)
- Top-performing formula: news peg → design lens → contrarian insight → sharp takeaway
- Best content: AI/robotics controversy (NEO robot hit 53,800 impressions)

---

## SaaS Ideas (top signals)
- **InspectionIQ** — AI reads car/property inspection reports, plain English + buy/negotiate/walk away. Petar got a RedBookInspect report same day.
- **TimezoneSafe** — flags brutal meeting times, suggests alternatives. Petar had 6:30am Teams call.
- **BOM Digest** — hyper-local weather alerts for tradies/parents/sites. Petar's fav.
- Full list in ~/clawd/ideas.json (10 ideas as of 2026-02-23)
