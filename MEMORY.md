# MEMORY.md — Mia's Long-Term Memory

Last updated: 2026-03-07

---

## People

### Petar Ceklic (@teknoperf)
- Product designer, 20 years exp, not a coder by trade
- Phone: 0434042628
- Telegram ID: 5897115037
- Nickname: Peki (use sometimes in messages to Ellen)
- Building multiple SaaS projects
- Timezone: GMT+8 (Perth, Australia)
- Passport: PB5508067 (see memory/passports.md for full details)
- Kids: Ozren and Filip
- Family cat (Temptations treats, Smitten Crystal litter)
- Claude Max plan (subscription billing, NOT API)
- Accountant: Shield Business Group (Vincent Kang)
- Active clients: Kevin Clark, Joel Hooper, Zasha O'Brien (Elastik), Jeffrey Poon (Austal), Len Webel (UWA/Sense Analytics), Chao Sun (UWA/SafePaths)

### Ellen Ceklic (Petar's wife)
- Full name: Ellen Ceklic, nickname: Elle Bell
- iMessage: +61411315424
- Telegram ID: 8680578395 (joined 2026-02-23)
- Woolworths: eceklic@gmail.com / password in ~/.env as WOOLWORTHS_PASSWORD
- Woolworths credit card Visa ending 4368, CVV: in ~/.env as WOOLWORTHS_CVV
- Delivery address: 22 Franklin St, Leederville WA 6097
- Passport: PB1714943 (see memory/passports.md for full details)
- Prefers organic, avoids highly processed food with additive numbers
- Comfort fabric conditioner (Marrakesh/Paris/Tahiti scents)
- Laundry: Resolv laundry sheets (Fresh Ocean)
- Grocery communication moved to Telegram (not iMessage) as of Feb 23

---

## Systems & Infrastructure

### Woolworths Grocery Automation
- Browser session persists (logged in as Ellen, clawd browser profile)
- **Woolworths uses nested shadow DOM** — wc-product-tile → wc-add-to-cart → button.add-to-cart-btn (pierce with .shadowRoot)
- Cart API: POST /api/v3/ui/trolley/update {items: [{Stockcode, Quantity}]}
- Search API: POST /apis/ui/Search/products
- CVV: in ~/.env as WOOLWORTHS_CVV (Visa 4368) — in cross-origin gr4vy iframe; find CDP target with "input.html?parentOrigin" in URL, inject via nativeInputValueSetter
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

### Amazon / Alexa
- Account: petarceklic@gmail.com / M73pqERrZGXt6G7
- Echo devices: 192.168.68.87 + 192.168.68.93 (office pod Echo)
- Sonos Arc is a SEPARATE unit — not linked to this Amazon account

### Fisher & Paykel Washing Machine (SmartHQ)
- App: SmartHQ
- Account: petarceklic@gmail.com / puwzYz-qanfyc-9pefpe
- Device: F&P 10KG SmartDrive Steam Care front-loader
- Network: 192.168.68.90 (MAC: fc:b9:7e:23:bd:b7 — GE/Haier/F&P)
- API: SmartHQ cloud (no local API)

### Sensibo (Air Con)
- API key: in ~/.env as SENSIBO_API_KEY
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

### Philips Hue
- Hue Bridge "2A5980" at 192.168.68.50
- Existing morning routines (Hue app/cloud-controlled): Kitchen & Lounge Morning (6:20-8:00 AM), Morning Coach (6:00-8:00 AM), Sunroom Mornings (sunrise-8:00 AM)
- Mia can trigger rooms/lights manually, create bridge-level schedules

### AirTouch 5 AC
- AirTouch 5 console ID: AT5C202405000322 (IP is DHCP — script uses UDP discovery, no hardcoded IP)
- Zones: Family Area, Master Bed, Gaystation, Ozren, Filip
- Cron: auto-off at 5:00 AM daily

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
- URL: http://192.168.68.52:3002 (Mac mini LAN) — **IP is DHCP, may change. Always check current IP before sharing.**
- Location: ~/clawd/war-room/server.js
- Ideas data: ~/clawd/ideas.json
- Pages: / (main), /ideas, /possum-au, /possum-us
- 🏆 Leaderboard nav link → http://192.168.68.52:8080/leaderboard (US vs AU head-to-head)
- Auto-starts via launchd
- **DO NOT change network/IP settings on Mac Mini** — use router DHCP reservation if static IP needed
- Add ideas to ideas.json directly whenever Petar mentions one

### Meeting Alert (Ellen)
- Cron: every minute, checks calendar for video calls
- Messages Ellen via iMessage ~15 min before
- Script: ~/clawd/scripts/meeting-alert.sh
- 7 template variations, signed "xo Mia"

---

## Communication Preferences
- **Never use em dashes** -- stated explicitly, applies globally
- **Telegram formatting:** bold titles need a carriage return above; dot-point lists need line breaks between sections
- **Website/analytics reports:** only surface interesting or notable changes (big swings). No full lists.
- **Trading updates:** always include all four bots (US, AU, Crypto, PM) in every summary
- **SaaS ideas auto-capture:** any time Petar mentions a SaaS idea, add it to ideas.json immediately
- **War Room:** prefers everything on one page; newest ideas at top (reverse chronological)
- **Quality bar:** test and have a higher bar before deploying -- expects things to work on first run
- **Morning briefing weather:** BOM is gold standard for Perth (not wttr.in or OpenWeatherMap)
- **During travel:** switch weather city and briefing time to match location

---

## Key Lessons Learned
- **"Possum" = all 4 bots**: Possum AU, Possum US, Possum Crypto, Possum PM — always check all 4 when asked



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

## Travel History
- **Vietnam:** Feb 4-10, Da Nang. TMS Hotel Da Nang. Stopover at Le Meridien Putrajaya (Malaysia) Feb 9.

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
- Planned: multi-location trip support, trip naming, pack template integration

### Possum US (Trading Bot)
- Location: ~/clawd/trading-bot-possum/
- Paper trading on IBKR (port 4002 = Gateway paper), $15k per variant
- Dashboard: http://192.168.68.63:8080/ (leaderboard at /leaderboard)
- War Room page: http://192.168.68.63:3002/possum-us
- Uses Grok (x.ai) as primary AI, Claude fallback
- LaunchAgents auto-start on boot (trader + dashboard)
- Status included in daily morning briefing
- **Added 2026-03-03:** Y1 (YOLO — bypasses regime filter, ≥0.60 conviction, trades all regimes) + X1 (Contrarian — inverts signal direction, tests if signals are predictive). If X1 outperforms, signals are backwards.
- Competition vs AU ends April 10

### Possum Crypto (Trading Bot)
- Location: ~/clawd/trading-bot-possum-crypto/
- Market: BTC/AUD, ETH/AUD, SOL/AUD (Kraken)
- Variants: MR1, MR2, MR3 (mean-reversion) + **M4 added 2026-03-03** (ADX momentum breakout — ADX>25 buys breakouts, silent when ranging)
- dry_run=True = paper execution with simulated fills at bid/ask. Leaderboard reads it properly. 18 trades, 3 open MR3 positions as of 2026-03-03.
- Regime tracking: Fear & Greed Index

### Possum PM / Polymarket (Trading Bot)
- Location: ~/clawd/trading-bot-possum-pm/
- Scans Polymarket for mispriced prediction markets using GDELT news + Grok
- **Contracts expanded 2026-03-03:** now 10 active (Ukraine ceasefire, Greenland, China/Taiwan blockade, US recession, Trump 60% tariffs China, Fed rate cut Mar 2026, US AI regulation, North Korea nuclear test, S&P >6000, Bitcoin >$150k)
- **News-triggered scanning added:** Grok screens all contracts for breaking news, bypasses 6h velocity gate when flagged. CLI: python main.py --news-scan
- **Market scanner added:** dynamic Polymarket discovery via Gamma API. CLI: python main.py --scan-markets
- Schedule: every 6 hours (plus news triggers)
- Status: paper signals
- **Major fixes 2026-03-07 (Claude Code session):**
  - SNI bug fixed (Python 3.14 SSL change broke Polymarket API) — 5/9 contracts now live
  - Velocity threshold lowered 3.0x → 1.5x
  - V2/V3/V5 variants activated (were silently idle since launch)
  - V2: confidence ceiling raised (Grok returns 0.80-0.85, ceiling was 0.75)
  - V3: resolution window raised to 300 days (was 30 — all contracts are 298+ days out)
  - V5: fixed broken estimated_probability field (Grok never returned it)
  - Anti-hedge guard added: first variant to fire on a contract sets direction; opposing blocked
  - GDELT panel restored on war-room PM page
- **Greenland legacy hedge:** V1 YES + V1 NO both open (predates anti-hedge guard). ~Cancel out on resolution. Effectively 3/5 position slots available for rest of competition.

### Possum Fleet Showdown (Competition)
- Started: March 1, 2026 | Ends: April 10, 2026 (6 weeks)
- All 4 Possum bots competing head-to-head, **$15,000 per variant** (not per bot)
- Leaderboard: http://192.168.68.63:8080/leaderboard
- Active AU variants: V1, V5, V11, V13, Y1, X1, NR1
- **Week 1 standings (Mar 7):** Crypto leading (~+$710 AUD), US strong (~+$955 USD), AU struggling (-$1,031 closed), PM now active after fixes
- **2026-03-07 mass fix session (Claude Code):** PM SNI bug, 4 variants activated, anti-hedge guard; US F/P2 PEAD variants unblocked. All bots now clean.

### Possum AU (Trading Bot)
- Location: ~/clawd/trading-bot-possum-au/
- Paper trading, A$5,000 starting capital, 21 ASX stocks
- **FULLY WIRED — submits real paper orders to IBKR** (confirmed 2026-02-27)
- Execution flow: `brain/orchestrator.py` → signal above threshold → `execution/order_manager.py` → portfolio_guard → `ibkr_client.py` → bracket order → IB Gateway port 4002
- Uses SMART routing (not direct ASX — Error 10311 was fixed 2026-02-27)
- **IBKR paper ASX limitation**: standalone SELL orders rejected as "cannot short" — only bracket child orders (with parentId) execute. Bot now has explicit short-sell guard.
- Uses Grok (x.ai) as primary AI — NOT OpenAI
- LaunchAgent runs 6:45 AM AWST daily (before ASX open at 7 AM)
- War Room page: http://192.168.68.63:3002/possum-au
- Config: port 4002 (IB Gateway paper) — same Gateway the watchdog monitors
- **Fill reconciliation FIXED (2026-03-03)**: ibkr_client.py now waits 15s for actual fill price, order_manager.py logs real fill (not quoted mid-price). Fill reconciler: execution/fill_reconciler.py
- **NST discovery**: quoted entry A$32.64 vs actual fill A$31.12 — 4.7% gap. DB now corrected.
- **DB state as of 2026-03-03**: NST open (114 shares @ $31.12 real fill, time exit March 4), MIN stopped out @ $55.82

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
- **SignatureAI** -- upload signature, get stylized/designer versions ($2 per)
- **PDF Form Filler** -- takes non-smart PDF forms, AI fills everything in
- **Component Screenshot Library** -- auto-capture UI components from live sites while browsing
- Full list in ~/clawd/ideas.json
