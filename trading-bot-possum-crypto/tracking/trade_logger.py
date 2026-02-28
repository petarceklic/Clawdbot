"""
Possum Crypto -- Trade Logger
Logs signals, trades, and regime changes to SQLite + daily JSON results.
Queries open/closed positions for P&L reporting.
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

    def get_position_summary(self) -> list[dict]:
        """Get summary of all open positions with current P&L."""
        try:
            from database.db import get_db
            db = get_db()
            rows = db.fetch_all(
                """SELECT symbol, variant, side, entry_price, quantity,
                          stop_loss, take_profit, current_price,
                          unrealised_pnl_aud, entry_timestamp_utc
                   FROM positions WHERE status = 'open'
                   ORDER BY entry_timestamp_utc"""
            )
            return [
                {
                    "symbol": r["symbol"],
                    "variant": r["variant"],
                    "side": r["side"],
                    "entry_price": r["entry_price"],
                    "quantity": r["quantity"],
                    "stop_loss": r["stop_loss"],
                    "take_profit": r["take_profit"],
                    "current_price": r["current_price"],
                    "unrealised_pnl_aud": r["unrealised_pnl_aud"],
                    "entry_timestamp_utc": r["entry_timestamp_utc"],
                }
                for r in rows
            ]
        except Exception as e:
            logger.warning("Failed to get position summary: %s", e)
            return []

    def get_closed_positions(self) -> list[dict]:
        """Get all closed positions for P&L history."""
        try:
            from database.db import get_db
            db = get_db()
            rows = db.fetch_all(
                """SELECT symbol, variant, side, entry_price, close_price,
                          quantity, realised_pnl_aud, close_reason,
                          entry_timestamp_utc, close_timestamp_utc
                   FROM positions WHERE status = 'closed'
                   ORDER BY close_timestamp_utc"""
            )
            return [dict(r) for r in rows]
        except Exception as e:
            logger.warning("Failed to get closed positions: %s", e)
            return []

    def get_total_pnl(self) -> dict:
        """Get total P&L across all positions (open + closed)."""
        try:
            from database.db import get_db
            db = get_db()

            realised = db.fetch_one(
                "SELECT COALESCE(SUM(realised_pnl_aud), 0) as total FROM positions WHERE status = 'closed'"
            )
            unrealised = db.fetch_one(
                "SELECT COALESCE(SUM(unrealised_pnl_aud), 0) as total FROM positions WHERE status = 'open'"
            )
            open_count = db.fetch_one(
                "SELECT COUNT(*) as cnt FROM positions WHERE status = 'open'"
            )
            closed_count = db.fetch_one(
                "SELECT COUNT(*) as cnt FROM positions WHERE status = 'closed'"
            )
            wins = db.fetch_one(
                "SELECT COUNT(*) as cnt FROM positions WHERE status = 'closed' AND realised_pnl_aud > 0"
            )
            losses = db.fetch_one(
                "SELECT COUNT(*) as cnt FROM positions WHERE status = 'closed' AND realised_pnl_aud <= 0"
            )

            return {
                "realised_pnl_aud": round(realised["total"], 4) if realised else 0,
                "unrealised_pnl_aud": round(unrealised["total"], 4) if unrealised else 0,
                "total_pnl_aud": round((realised["total"] if realised else 0) + (unrealised["total"] if unrealised else 0), 4),
                "open_positions": open_count["cnt"] if open_count else 0,
                "closed_positions": closed_count["cnt"] if closed_count else 0,
                "wins": wins["cnt"] if wins else 0,
                "losses": losses["cnt"] if losses else 0,
            }
        except Exception as e:
            logger.warning("Failed to get total P&L: %s", e)
            return {}

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

        # Attach P&L summary
        cycle_result["pnl_summary"] = self.get_total_pnl()

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
