# Possum Crypto -- Cryptocurrency Trading Bot

## Cross-Project Rule
**When making changes to Possum Crypto, always check if the same change applies to Possum US** (`/Users/clawd/clawd/trading-bot-possum`) **and Possum AU** (`/Users/clawd/clawd/trading-bot-possum-au`). The three projects share architecture: regime filter, variant engine, orchestrator, Grok agent, config patterns. Bug fixes and logic changes in one almost always need porting to the others.

## Architecture
- **Regime filter** (`filters/regime_filter.py`): Classifies Fear & Greed Index into EXTREME_FEAR, BEARISH, NEUTRAL, BULLISH, EXTREME_GREED.
- **Variants** (`variants/`): M1-M3 (momentum), MR1-MR3 (mean reversion), S1-S3 (sentiment).
- **Regime-variant matrix** (`config.py`): Controls which variants can trade per regime.
- **Exchange** (`exchange/adapter.py`): Kraken via ccxt. Spot only, no leverage.
- **Grok agent** (`agent/grok_agent.py`): xAI API, grok-4-1-fast-non-reasoning, JSON response format.

## Asset Universe
3 assets: BTC/AUD, ETH/AUD, SOL/AUD. Defined in `config.py` TradingSettings.

## Key Thresholds
- Fear & Greed: <20 extreme fear, >80 extreme greed
- Position size: $100 AUD max per trade (paper phase)
- Stop loss: 5% hard stop
- Grok confidence: 0.6 minimum for momentum variants, 0.7 for S1

## Style
- Never use em dashes. Use double hyphens (--) instead.
