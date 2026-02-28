"""
Possum Crypto -- Trade Logger
Logs signals, trades, and regime changes to SQLite + daily JSON results.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from config import RESULTS_DIR

logger = logging.getLogger("possum.crypto.logger")


class TradeLogger:
    """Logs all pipeline outputs to SQLite and writes daily JSON summaries."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()
        RESULTS_DIR.mkdir(exist_ok=True)

    def log_signal(
        self,
        symbol: str,
        variant: str,
        signal: str,
        confidence: float,
        grok_direction: str | None,
        grok_confidence: float | None,
        regime: str,
        fgi_value: int | None,
        price: float,
        reasoning: str,
        executed: bool = False,
    ):
        """Log a variant signal to crypto_signals table."""
        try:
            from database.db import get_db
            db = get_db()
            db.execute_insert(
                """INSERT INTO crypto_signals
                   (timestamp_utc, symbol, variant, signal, confidence,
                    grok_direction, grok_confidence, regime, fgi_value,
                    price_at_signal, reasoning, executed)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    datetime.now(timezone.utc).isoformat(),
                    symbol,
                    variant,
                    signal,
                    confidence,
                    grok_direction,
                    grok_confidence,
                    regime,
                    fgi_value,
                    price,
                    reasoning,
                    executed,
                ),
            )
        except Exception as e:
            logger.warning("Failed to log signal: %s", e)

    def write_daily_results(self, cycle_result: dict):
        """Write daily results JSON for the leaderboard / monitoring."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filepath = RESULTS_DIR / f"crypto_{today}.json"

        # Append to existing file if multiple runs per day
        existing = []
        if filepath.exists():
            try:
                existing = json.loads(filepath.read_text())
                if not isinstance(existing, list):
                    existing = [existing]
            except (json.JSONDecodeError, Exception):
                existing = []

        cycle_result["timestamp_utc"] = datetime.now(timezone.utc).isoformat()
        existing.append(cycle_result)

        filepath.write_text(json.dumps(existing, indent=2, default=str))
        logger.info("Daily results written to %s", filepath)


# Singleton
_logger: TradeLogger | None = None


def get_trade_logger() -> TradeLogger:
    global _logger
    if _logger is None:
        _logger = TradeLogger()
    return _logger
