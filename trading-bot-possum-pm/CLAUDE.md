# Possum PM — Polymarket Prediction Market Scanner

## Cross-Project Rule
**When making changes to Possum PM, check if the same change applies to Possum US** (`/Users/clawd/clawd/trading-bot-possum`) **or Possum AU** (`/Users/clawd/clawd/trading-bot-possum-au`). The three projects share architecture: Grok agent pattern, config pattern, database pattern, retry logic.

## Architecture
- **Pipeline** (`brain/orchestrator.py`): 5-stage per-contract pipeline — velocity check → manifold+polymarket price → alert gate → Grok evaluation → paper trade logging.
- **Data layer** (`data/`): VelocityChecker (GDELT article velocity, stub in Phase 1), ManifoldChecker (real Manifold Markets API), PolymarketClient (stub in Phase 1).
- **Grok agent** (`agent/grok_agent.py`): xAI API, grok-4-1-fast-non-reasoning, JSON response format. PM-specific prompt instructs Grok to search X/Twitter for latest geopolitical intel.
- **Contracts** (`contracts.json`): Active contracts to scan. Each has polymarket_slug, manifold_search_term, keywords, resolution_date.

## Key Thresholds
- Velocity: 3.0x (article velocity vs 30-day baseline)
- Manifold gap: 15pp (|manifold_probability - polymarket_price| * 100)
- Alert gate: velocity >= threshold OR gap >= threshold (not AND)

## Build Phases
- **Phase 1** (current): Pipeline skeleton, stub velocity/polymarket, real Manifold + Grok
- **Phase 2**: Real GDELT velocity, real Polymarket API, baseline tracking
- **Phase 3**: Enrichment layer (Congress.gov, Federal Register, CENTCOM)
- **Phase 4**: Dashboard + cross-feed to US/AU
- **Phase 5**: Scheduler + launchd
- **Phase 6**: Live paper trading loop

## Seed Contracts (Phase 1)
1. Iran military strike (velocity stub: 4.0x — triggers alert)
2. Ukraine ceasefire (velocity stub: 1.2x — below threshold)
3. Greenland acquisition (velocity stub: 0.8x — below threshold)
