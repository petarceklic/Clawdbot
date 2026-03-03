# Possum PM — Enrichment Layer (PoC)

**Target contract:** US strikes Iran by June 2026 (Polymarket)

## enrichment_test.py

Proof-of-concept confirmation layer scraper. Queries 5 sources independently and returns structured JSON.

### Run all sources
```bash
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py
```

### Test a single source
```bash
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py --source metaculus
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py --source federal-register
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py --source centcom
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py --source congress
~/clawd/venvs/possum-pm/bin/python3 enrichment_test.py --source marinetraffic
```

---

## Source Status (tested 2026-02-28)

| Source | Status | Notes |
|--------|--------|-------|
| **Metaculus / Manifold** | ✅ Working | Switched to Manifold Markets (open API). Found exact contract "US strikes Iran by June 30, 2026" at **74% probability**, 77 traders. Set `METACULUS_TOKEN` env var to enable Metaculus auth. |
| **Federal Register** | ✅ Working | 14 docs found. Key: Feb 11 Presidential Document *"Addressing Threats to the United States by the Government of Iran"* |
| **CENTCOM** | ✅ Working (via Google News RSS) | 47 Iran-related articles flagged. centcom.mil direct scraping 403s; Google News RSS fallback works cleanly. |
| **MarineTraffic** | ✅ Placeholder working | Structure defined, API not wired. Set `MT_API_KEY` env var. Monitored regions: Persian Gulf, Arabian Sea, Strait of Hormuz. |
| **Congress.gov** | ⚠️ Needs API key | congress.gov blocks unauthenticated requests. Register free key at https://api.congress.gov — set `CONGRESS_API_KEY` env var. |

---

## Key Finding (2026-02-28)

The forecaster consensus from Manifold Markets:
- **"US strikes Iran by June 30, 2026"** → **74%** (77 traders)
- **"Will U.S. weapons strike targets inside Iran by March 31, 2026?"** → **73%** (184 traders)
- **"Will the US strike Iran by end of February?"** → **18%** (1,013 traders — imminent window already closing)

Presidential Document from Feb 11 2026 titled *"Addressing Threats to the United States by the Government of Iran"* — directly relevant executive action logged in the Federal Register.

---

## Next Steps

1. **Get Congress.gov API key** → https://api.congress.gov (free, instant)
2. **Wire real MarineTraffic API** → set `MT_API_KEY`
3. Wrap these 5 functions into `enrichment.fetch` module
4. Connect to Possum PM pre-scanner
5. Build scoring layer: weight each source, output a signal score (0–1)

---

## Environment Variables

```bash
CONGRESS_API_KEY=...    # Free from api.congress.gov
METACULUS_TOKEN=...     # From metaculus.com account settings
MT_API_KEY=...          # Paid MarineTraffic API
```
