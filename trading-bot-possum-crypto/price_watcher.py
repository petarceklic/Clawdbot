#!/usr/bin/env python3
"""
Possum Crypto -- Price Watcher
Lightweight position monitor that runs every 15 minutes.
Fetches current prices, updates open positions, closes any that hit stop/TP.

No Grok, no regime filter, no variant engine -- just price monitoring.

Usage:
  python3 price_watcher.py
"""

import logging
import sys
import time
from pathlib import Path

# Ensure project root is on path (same as main.py)
sys.path.insert(0, str(Path(__file__).parent))


def setup_logging():
    """Configure logging to price_watcher.log (separate from analysis.log)."""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)-35s | %(levelname)-7s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(log_dir / "price_watcher.log"),
            logging.StreamHandler(),
        ],
    )
    # Suppress noisy third-party loggers (same as main.py)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("ccxt").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def run_price_check():
    """
    Core logic:
    1. Query open positions from DB
    2. If none, exit immediately (fast path)
    3. Fetch current prices from Kraken
    4. Update positions with current prices
    5. Check stop-loss and take-profit levels
    6. Log results
    """
    logger = logging.getLogger("possum.crypto.watcher")
    start = time.monotonic()

    logger.info("Price watcher starting")

    # Fast path: check if any positions are open before fetching prices
    from database.db import get_db

    db = get_db()
    row = db.fetch_one("SELECT COUNT(*) as cnt FROM positions WHERE status = 'open'")
    open_count = row["cnt"] if row else 0

    if open_count == 0:
        logger.info(
            "No open positions -- nothing to check (%.1fs)",
            time.monotonic() - start,
        )
        return

    logger.info("Checking %d open position(s)", open_count)

    # Fetch current prices only for symbols with open positions
    open_symbols_rows = db.fetch_all(
        "SELECT DISTINCT symbol FROM positions WHERE status = 'open'"
    )
    open_symbols = [r["symbol"] for r in open_symbols_rows]

    from data.market_data import fetch_all_tickers

    tickers = fetch_all_tickers(open_symbols)
    # Convert to {symbol: price} dict (same as orchestrator._check_open_positions)
    prices = {
        sym: t.get("last", 0)
        for sym, t in tickers.items()
        if t.get("last")
    }

    if not prices:
        logger.error("Failed to fetch any prices -- aborting")
        return

    # Update current prices and unrealised P&L
    from execution.trader import get_trader

    trader = get_trader()
    trader.update_positions(prices)

    # Check stop-loss and take-profit
    closed = trader.check_stops_and_targets(prices)

    elapsed = time.monotonic() - start

    if closed:
        logger.info(
            "WATCHER CLOSED %d position(s) in %.1fs: %s",
            len(closed),
            elapsed,
            ", ".join(
                f"{c['symbol']} ({c['close_reason']}, P&L ${c['pnl_aud']:.2f})"
                for c in closed
            ),
        )
    else:
        logger.info(
            "All %d position(s) within bounds (%.1fs) -- %s",
            open_count,
            elapsed,
            ", ".join(
                f"{sym}: ${prices.get(sym, 0):,.2f}" for sym in open_symbols
            ),
        )


def main():
    setup_logging()
    try:
        run_price_check()
    except Exception as e:
        logging.getLogger("possum.crypto.watcher").error(
            "Price watcher failed: %s", e, exc_info=True
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
