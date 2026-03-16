# MEMORY.md — Mia's Long-Term Memory

Last updated: 2026-03-16

---

## People

### Petar Ceklic (@teknoperf)
- Product designer, 20 years exp, not a coder by trade
- Phone: 0434042628 | Telegram ID: 5897115037
- Nickname: Peki (use sometimes in messages to Ellen)
- Building multiple SaaS projects | Timezone: GMT+8 (Perth, Australia)
- Passport: PB5508067 (see memory/passports.md)
- Kids: Ozren and Filip | Family cat (Temptations treats, Smitten Crystal litter)
- Claude Max plan (subscription billing, NOT API)
- Accountant: Shield Business Group (Vincent Kang)
- Active clients: Kevin Clark, Joel Hooper, Zasha O'Brien (Elastik), Jeffrey Poon (Austal), Len Webel (UWA/Sense Analytics), Chao Sun (UWA/SafePaths)

### Ellen Ceklic (Petar's wife)
- Nickname: Elle Bell | iMessage: +61411315424 | Telegram ID: 8680578395
- Woolworths: eceklic@gmail.com / password in ~/.env as WOOLWORTHS_PASSWORD
- Woolworths credit card Visa ending 4368, CVV: in ~/.env as WOOLWORTHS_CVV
- Delivery address: 22 Franklin St, Leederville WA 6097
- Passport: PB1714943 (see memory/passports.md)
- Prefers organic, avoids highly processed food with additive numbers
- Comfort fabric conditioner (Marrakesh/Paris/Tahiti scents) | Laundry: Resolv sheets (Fresh Ocean)
- Grocery communication via Telegram (not iMessage)

---

## Systems & Infrastructure

### Mac Mini
- **Current IP: 192.168.68.52** (DHCP -- always verify before sharing)
- Get current IP: `python3 -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0])"`
- Deco DHCP reservation set for 192.168.68.62 (set 2026-03-15, not yet active)
- User: clawd | Password: ~/.env as CLAWD_LOGIN_PASSWORD

### War Room Dashboard
- URL: http://[MAC_MINI_IP]:3002 | Location: ~/clawd/war-room/server.js
- Ideas data: ~/clawd/ideas.json | Auto-starts via launchd
- Add ideas to ideas.json directly whenever Petar mentions one

### GDELT Nightcrawler
- Dashboard: http://[MAC_MINI_IP]:8000 (uvicorn, always running)
- Project: ~/clawd/GDELT NightCrawler/ | Runs nightly 10pm-5am AWST
- Downloads GDELT data to /Volumes/5TB Drive/ -- high CPU is expected, DO NOT kill

### Woolworths Grocery Automation
- Browser session persists (logged in as Ellen, clawd browser profile)
- Woolworths uses nested shadow DOM -- fall back to direct CDP WebSocket scripting on timeout
- Cart API: POST /api/v3/ui/trolley/update | Search API: POST /apis/ui/Search/products
- Delivery Unlimited ACTIVE -- free delivery | Fruit & Veg: NO substitutions
- Apples: always search "Pink Lady apples" | Sukin: 1L body wash ONLY when on special
- Italian pasta: La Molisana or De Cecco (NOT Barilla) | Kimchi: skip if in last 2 orders

### Ceklic Family Calendar
- HTTPS: https://p107-caldav.icloud.com/published/2/Mjc5ODI3MjU2Mjc5ODI3Mj3vc4T_53TNurZcMKZ3YjyFoYzX_-lQMGczVpC_mB3NkjRKasAKsOGs-S-x1PpNs0t3ogSpWCC0SJln0O2vbRo
- Name: Ceklic Fam v2 (iCloud shared) -- use for TRMNL and family event context

### TRMNL Family Calendar Screen
- Project: ~/clawd/trmnl-family-calendar/ (markup.html + worker.js)
- Worker: https://trmnl-family-calendar.petarceklic.workers.dev
- Shows today's events + 4 upcoming + Perth weather | Deploy: npx wrangler deploy
- E-ink 800x480, black/white only -- upcoming cap is 4 events

### Laundry Alert
- Script: ~/clawd/scripts/laundry-alert.py
- Flash groups: Lounge (1) + Kitchen (3) only, 5 seconds
- **THE LIGHT STRIP IS ALWAYS THE LOUNGE** (light 24, gradient strip) -- never ask which one
- Root cause of blue-stuck bug (fixed 2026-03-16): get_gradient_state() wasn't saving color.xy -- flash set blue, restore sent no color, stayed blue. Now saves and restores color field.
- State file: ~/clawd/scripts/.laundry-light-state.json (write-once, cleared after restore)
- Safety restore: laundry-restore.py runs 2min after alert

### IB Gateway Watchdog
- Script: ~/clawd/scripts/ib-gateway-watchdog.sh | App: ~/Applications/IB Gateway 10.44/
- Restarts via IBC at ~/ibc/ (headless auto-login) | Config: ~/ibc/config.ini
- Credentials: ~/.env as IB_GATEWAY_USERNAME / IB_GATEWAY_PASSWORD

### Philips Hue
- Bridge at 192.168.68.50 | API key: ~/.env as HUE_API_KEY
- DO NOT automate lounge lights -- morning routines cause issues. Manual only.
- Lounge gradient strip: light 24, v2 UUID: 42efec77-4330-4881-af4d-3b38858026e4

### Google Analytics / Search Console
- Sites monitored: petarceklic.com, ellenceklic.com, thedatafusion.com, disruptis.io, travelabindex.com, mineralvolatility.com, finchindex.com
- Script: ~/clawd/scripts/site-monitor.py
- Ellen's GA: account a317517606, property p445362232

### SEO Posta
- Cron ID: 5e932bb9-3c23-4739-a364-b1c0087ac29c | Schedule: Tue & Fri 9am UTC
- Runs ALL 4 sites: volterra, finch, travel-lab, disruptis
- Project: ~/clawd/SEO Posta/ | Site registry: src/registry/sites.ts

### Other Systems
- Sensibo (office AC): API key ~/.env SENSIBO_API_KEY | Pod: HxJbpzZN
- WF-RAC (Ellen's office AC): 192.168.68.70:51443 (plain HTTP) | Script: ~/clawd/scripts/wf-rac.py
- AirTouch 5: UDP discovery, no hardcoded IP | Cron: auto-off 5am daily
- Amazon/Alexa: petarceklic@gmail.com | Echo: 192.168.68.87 + .93
- Washing machine (SmartHQ): petarceklic@gmail.com / puwzYz-qanfyc-9pefpe | 192.168.68.90
- Ring monitor: ~/clawd/scripts/ring-monitor.py | Leederville + Mount Lawley FIL | 11pm-5am
- Meeting alert: ~/clawd/scripts/meeting-alert.sh | ~15min before Ellen's video calls

---

## Communication Preferences
- **Only bother Petar if he needs to know** -- no routine updates, no "fixed it" confirmations, no health check results unless something is actually broken. Silence is the default.
- **Never use em dashes** -- stated explicitly, applies globally
- Never ask which light strip -- it's ALWAYS the lounge gradient strip (light 24)
- Never ask "is there a dashboard?" -- just find it
- Always check current IP before sharing any local URL
- Telegram: bold titles need carriage return above; lists need line breaks between sections
- Analytics reports: only surface interesting/notable changes. No full lists.
- Trading updates: always include all 4 bots in every summary
- SaaS ideas: add to ideas.json immediately whenever Petar mentions one
- Quality bar: test before deploying -- expects things to work first run
- Morning briefing weather: BOM is gold standard for Perth
- Petar's feedback style: direct, fair, won't sugarcoat -- earn trust through consistency

---

## Key Lessons Learned
- **"Possum" = all 4 bots**: AU, US, Crypto, PM -- always check all 4
- **Possum PnL = per variant $15k**: use leaderboard, never DB equity totals
- **Always memory_search before saying "I don't have that"**
- **Read SYSTEMS.md on startup** -- check crons are running
- **Check session logs before re-attempting a fix** -- don't repeat failed approaches
- Woolworths: product detail pages work in clawd browser; browse pages don't
- Clawd browser act/snapshot timeouts: gateway restart fixes it (SIGUSR1)
- Billing: runs via anthropic:claude-cli OAuth -- uses Claude subscription, NOT API key

---

## Travel

### History
- Vietnam: Feb 4-10 2026, Da Nang (TMS Hotel). Stopover Le Meridien Putrajaya Feb 9.

### Bali Trip (March 2026)
- Arrival: 17 March | Departure: 22 March | Hotel: Maya Ubud Resort & Spa

---

## Petar's Projects

### Paak (iOS App) — LIVE
- Trip packing app | App Store: https://apps.apple.com/au/app/paak/id6759315100
- Built with Claude Code | Live 2026-02-24

### Possum Fleet (Trading Bots)
- Competition: March 1 – April 10 2026 | $15k per variant
- Leaderboard: http://[MAC_MINI_IP]:8080/leaderboard
- **US** (~/clawd/trading-bot-possum/): IBKR paper, Grok AI, variants incl Y1/X1
- **AU** (~/clawd/trading-bot-possum-au/): ASX paper, 21 stocks, LaunchAgent 6:45am AWST
- **Crypto** (~/clawd/trading-bot-possum-crypto/): BTC/ETH/SOL on Kraken, variants MR1-3 + M4
- **PM** (~/clawd/trading-bot-possum-pm/): Polymarket via GDELT+Grok, 10 contracts

### LinkedIn Posta
- Cron ID: 637b3b53 | Mon/Wed/Fri 10:30am → 3 ideas to Telegram
- Context: ~/clawd/linkedin-context.md | Top post: NEO robot (53,800 impressions)

### Data Intelligence Products
- **Volterra** (mineralvolatility.com): ML minerals volatility, 12 minerals, AWS Data Exchange
- **Finch** (finchindex.com): 1M+ preprints, 73 innovation themes, "2 years ahead of the money"
- **Disruptis** (disruptis.io): trade disruption intelligence, severity scoring
- **Travel Lab** (travelabindex.com): destination trend prediction via social signals

---

## SaaS Ideas (top signals)
- InspectionIQ, TimezoneSafe, BOM Digest, SignatureAI, PDF Form Filler, Component Screenshot Library
- Full list: ~/clawd/ideas.json
