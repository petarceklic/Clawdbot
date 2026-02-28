#!/usr/bin/env python3
"""
Possum Crypto -- Main Entry Point

Usage:
  python3 main.py --once          # Run one analysis cycle
  python3 main.py --health        # Health check (connectivity, APIs, DB)
  python3 main.py --dry-run       # Force dry-run mode (default anyway)
"""

import argparse
import logging
import sys
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))


def setup_logging(level: str = "INFO"):
    """Configure logging for all possum.crypto.* loggers."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(name)-35s | %(levelname)-7s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("ccxt").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def health_check():
    """Run connectivity and configuration health checks."""
    logger = logging.getLogger("possum.crypto.health")
    all_ok = True

    # 1. Config loads
    logger.info("1. Config...")
    try:
        from config import get_config
        cfg = get_config()
        logger.info("   OK -- universe: %s, dry_run: %s", cfg.trading.universe, cfg.trading.dry_run)
    except Exception as e:
        logger.error("   FAIL -- %s", e)
        all_ok = False

    # 2. Database
    logger.info("2. Database...")
    try:
        from database.db import get_db
        db = get_db()
        # Test a simple query
        db.execute("SELECT 1")
        logger.info("   OK -- %s", cfg.db_path)
    except Exception as e:
        logger.error("   FAIL -- %s", e)
        all_ok = False

    # 3. Exchange connectivity (public endpoint -- no auth needed)
    logger.info("3. Kraken exchange (public)...")
    try:
        from exchange.adapter import ExchangeAdapter
        # Don't use singleton -- test fresh connection without API keys
        adapter = ExchangeAdapter()
        ticker = adapter.fetch_ticker("BTC/AUD")
        logger.info("   OK -- BTC/AUD: $%.2f AUD", ticker.get("last", 0))
    except Exception as e:
        logger.error("   FAIL -- %s", e)
        all_ok = False

    # 4. Fear & Greed API
    logger.info("4. Fear & Greed Index...")
    try:
        from filters.regime_filter import fetch_fear_and_greed
        fgi = fetch_fear_and_greed()
        logger.info("   OK -- FGI: %d (%s)", fgi["value"], fgi["label"])
    except Exception as e:
        logger.error("   FAIL -- %s", e)
        all_ok = False

    # 5. Grok API key
    logger.info("5. Grok API key...")
    if cfg.llm.xai_api_key:
        masked = cfg.llm.xai_api_key[:8] + "..." + cfg.llm.xai_api_key[-4:]
        logger.info("   OK -- key: %s (model: %s)", masked, cfg.llm.grok_model)
    else:
        logger.warning("   WARN -- XAI_API_KEY not set (Grok calls will fail)")
        # Not fatal -- can still test everything else

    # 6. Technical indicators (quick sanity check)
    logger.info("6. Technical indicators...")
    try:
        from data.market_data import fetch_ohlcv
        from data.technical_indicators import get_all_indicators
        df = fetch_ohlcv("BTC/AUD", timeframe="1h", limit=60)
        ind = get_all_indicators(df, "BTC/AUD")
        logger.info(
            "   OK -- BTC/AUD RSI=%.1f, EMA25=%.2f, EMA50=%.2f, MACD=%s",
            ind.get("rsi", 0), ind.get("ema_25", 0),
            ind.get("ema_50", 0), ind.get("macd_signal", "?"),
        )
    except Exception as e:
        logger.error("   FAIL -- %s", e)
        all_ok = False

    logger.info("=" * 40)
    if all_ok:
        logger.info("HEALTH CHECK: ALL PASSED")
    else:
        logger.error("HEALTH CHECK: SOME CHECKS FAILED")

    return all_ok


def run_once():
    """Run a single analysis cycle."""
    logger = logging.getLogger("possum.crypto.main")
    logger.info("Running single analysis cycle...")

    from brain.orchestrator import get_orchestrator
    orchestrator = get_orchestrator()
    result = orchestrator.run_cycle()

    logger.info("Cycle result: %s", result.get("status"))
    logger.info("Regime: %s (FGI: %s)", result.get("regime"), result.get("fgi_value"))
    logger.info("Assets processed: %d, Trades: %d",
                result.get("assets_processed", 0), result.get("trades_placed", 0))

    # Print per-asset summary
    for r in result.get("results", []):
        sym = r.get("symbol", "?")
        action = r.get("action", "?")
        variant = r.get("variant", "-")
        grok = r.get("grok_signal", "-")
        conf = r.get("grok_confidence", 0)
        logger.info("  %s: %s (variant=%s, grok=%s, conf=%.2f)", sym, action, variant, grok, conf)

    return result


def main():
    parser = argparse.ArgumentParser(description="Possum Crypto Trading Bot")
    parser.add_argument("--once", action="store_true", help="Run one analysis cycle")
    parser.add_argument("--health", action="store_true", help="Run health check")
    parser.add_argument("--dry-run", action="store_true", help="Force dry-run mode")
    parser.add_argument("--log-level", default="INFO", help="Logging level (default: INFO)")
    args = parser.parse_args()

    setup_logging(args.log_level)

    if args.health:
        ok = health_check()
        sys.exit(0 if ok else 1)

    if args.once:
        run_once()
        sys.exit(0)

    # Default: show help
    parser.print_help()


if __name__ == "__main__":
    main()
