"""
Possum Crypto -- Trade Executor
Dry-run simulates fills from ticker bid/ask; live places market orders via Kraken.
Manages positions table for ongoing P&L tracking.
"""

import logging
from datetime import datetime, timezone

from variants.base_variant import TradeSignal

logger = logging.getLogger("possum.crypto.trader")


class Trader:
    """Executes trade signals -- dry-run simulation or live Kraken orders."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()
        self.dry_run = self.cfg.trading.dry_run

    def execute_signal(self, signal: TradeSignal, ticker: dict) -> dict:
        """
        Execute a trade signal. Returns result dict.

        In dry-run mode: simulates fill at current bid/ask.
        In live mode: places market order via Kraken.
        """
        if self.dry_run:
            return self._simulate(signal, ticker)
        else:
            return self._execute_live(signal)

    def _simulate(self, signal: TradeSignal, ticker: dict) -> dict:
        """Simulate a fill using current ticker data."""
        # Use bid for sells, ask for buys (realistic slippage)
        if signal.side == "buy":
            fill_price = ticker.get("ask") or ticker.get("last") or signal.suggested_entry
        else:
            fill_price = ticker.get("bid") or ticker.get("last") or signal.suggested_entry

        if fill_price is None or fill_price <= 0:
            logger.warning("Cannot simulate %s for %s -- no valid price", signal.side, signal.symbol)
            return {"action": "rejected", "reason": "no_price"}

        # Calculate quantity based on max position size
        max_aud = self.cfg.trading.max_position_size_aud
        quantity = max_aud / fill_price

        # Estimate fee
        fee_pct = self.cfg.trading.taker_fee_pct
        fee_aud = max_aud * fee_pct

        result = {
            "action": "simulated_fill",
            "symbol": signal.symbol,
            "variant": signal.variant,
            "side": signal.side,
            "quantity": round(quantity, 8),
            "fill_price_aud": round(fill_price, 2),
            "notional_aud": round(max_aud, 2),
            "fee_aud": round(fee_aud, 4),
            "stop_price": signal.suggested_stop,
            "target_price": signal.suggested_target,
            "confidence": signal.confidence,
            "dry_run": True,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(
            "DRY RUN %s %s: %.8f @ $%.2f AUD ($%.2f notional, $%.4f fee) [%s]",
            signal.side.upper(), signal.symbol, quantity, fill_price,
            max_aud, fee_aud, signal.variant,
        )

        # Log to database
        self._log_trade(result, signal)
        self._open_position(result, signal)

        return result

    def _execute_live(self, signal: TradeSignal) -> dict:
        """Place a live market order via Kraken."""
        from exchange.adapter import get_exchange

        exchange = get_exchange()
        max_aud = self.cfg.trading.max_position_size_aud

        try:
            # Get current price for quantity calculation
            ticker = exchange.fetch_ticker(signal.symbol)
            price = ticker.get("last", 0)
            if price <= 0:
                return {"action": "rejected", "reason": "no_price"}

            quantity = max_aud / price

            # Place market order
            order = exchange.create_order(
                symbol=signal.symbol,
                side=signal.side,
                amount=quantity,
            )

            result = {
                "action": "trade_placed",
                "symbol": signal.symbol,
                "variant": signal.variant,
                "side": signal.side,
                "quantity": quantity,
                "order_id": order.get("id"),
                "fill_price_aud": order.get("price") or price,
                "notional_aud": round(max_aud, 2),
                "confidence": signal.confidence,
                "dry_run": False,
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            }

            logger.info(
                "LIVE %s %s: order %s placed [%s]",
                signal.side.upper(), signal.symbol,
                order.get("id"), signal.variant,
            )

            self._log_trade(result, signal)
            self._open_position(result, signal)
            return result

        except Exception as e:
            logger.error("Live order failed for %s %s: %s", signal.side, signal.symbol, e)
            return {"action": "error", "reason": str(e)}

    def update_positions(self, prices: dict[str, float]):
        """
        Update current prices and unrealised P&L on all open positions.
        Called at the start of each cycle.

        prices: dict mapping symbol -> current price (e.g. {"BTC/AUD": 94000.0})
        """
        from database.db import get_db
        db = get_db()

        open_positions = db.fetch_all(
            "SELECT id, symbol, side, entry_price, quantity FROM positions WHERE status = 'open'"
        )

        for pos in open_positions:
            symbol = pos["symbol"]
            if symbol not in prices:
                continue

            current_price = prices[symbol]
            entry_price = pos["entry_price"]
            quantity = pos["quantity"]
            side = pos["side"]

            if side == "buy":
                pnl = (current_price - entry_price) * quantity
            else:
                pnl = (entry_price - current_price) * quantity

            db.execute(
                """UPDATE positions
                   SET current_price = ?, unrealised_pnl_aud = ?
                   WHERE id = ?""",
                (round(current_price, 2), round(pnl, 4), pos["id"]),
            )

        if open_positions:
            logger.info("Updated prices on %d open positions", len(open_positions))

    def check_stops_and_targets(self, prices: dict[str, float]) -> list[dict]:
        """
        Check open positions for stop-loss or take-profit hits.
        Returns list of closed position dicts.
        """
        from database.db import get_db
        db = get_db()

        open_positions = db.fetch_all(
            "SELECT * FROM positions WHERE status = 'open'"
        )

        closed = []
        now = datetime.now(timezone.utc).isoformat()

        for pos in open_positions:
            symbol = pos["symbol"]
            if symbol not in prices:
                continue

            current_price = prices[symbol]
            entry_price = pos["entry_price"]
            stop_loss = pos["stop_loss"]
            take_profit = pos["take_profit"]
            quantity = pos["quantity"]
            side = pos["side"]

            close_reason = None

            if side == "buy":
                if current_price <= stop_loss:
                    close_reason = "stop_loss"
                elif current_price >= take_profit:
                    close_reason = "take_profit"
            else:  # sell/short
                if current_price >= stop_loss:
                    close_reason = "stop_loss"
                elif current_price <= take_profit:
                    close_reason = "take_profit"

            if close_reason:
                if side == "buy":
                    pnl = (current_price - entry_price) * quantity
                else:
                    pnl = (entry_price - current_price) * quantity

                db.execute(
                    """UPDATE positions
                       SET status = 'closed', close_timestamp_utc = ?,
                           close_price = ?, realised_pnl_aud = ?,
                           close_reason = ?, current_price = ?,
                           unrealised_pnl_aud = 0
                       WHERE id = ?""",
                    (now, round(current_price, 2), round(pnl, 4),
                     close_reason, round(current_price, 2), pos["id"]),
                )

                closed_info = {
                    "symbol": symbol,
                    "variant": pos["variant"],
                    "side": side,
                    "entry_price": entry_price,
                    "close_price": current_price,
                    "pnl_aud": round(pnl, 4),
                    "close_reason": close_reason,
                }
                closed.append(closed_info)

                logger.info(
                    "POSITION CLOSED: %s %s [%s] -- %s @ $%.2f -> $%.2f, P&L $%.2f",
                    side.upper(), symbol, pos["variant"],
                    close_reason, entry_price, current_price, pnl,
                )

        return closed

    def has_open_position(self, symbol: str) -> bool:
        """Check if there's already an open position for this symbol."""
        from database.db import get_db
        db = get_db()
        row = db.fetch_one(
            "SELECT COUNT(*) as cnt FROM positions WHERE symbol = ? AND status = 'open'",
            (symbol,),
        )
        return row["cnt"] > 0 if row else False

    def _open_position(self, result: dict, signal: TradeSignal):
        """Create a position record when a trade is executed."""
        try:
            from database.db import get_db
            db = get_db()
            db.execute_insert(
                """INSERT INTO positions
                   (symbol, variant, side, entry_timestamp_utc, entry_price,
                    quantity, stop_loss, take_profit, current_price,
                    unrealised_pnl_aud, status, dry_run)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)""",
                (
                    signal.symbol,
                    signal.variant,
                    signal.side,
                    result.get("timestamp_utc"),
                    result.get("fill_price_aud"),
                    result.get("quantity"),
                    signal.suggested_stop or self._default_stop(result.get("fill_price_aud", 0), signal.side),
                    signal.suggested_target or self._default_target(result.get("fill_price_aud", 0), signal.side),
                    result.get("fill_price_aud"),
                    result.get("dry_run", True),
                ),
            )
            logger.info(
                "Position opened: %s %s [%s] @ $%.2f, stop=$%.2f, TP=$%.2f",
                signal.side, signal.symbol, signal.variant,
                result.get("fill_price_aud", 0),
                signal.suggested_stop or 0,
                signal.suggested_target or 0,
            )
        except Exception as e:
            logger.warning("Failed to open position record: %s", e)

    def _default_stop(self, price: float, side: str) -> float:
        pct = self.cfg.trading.stop_loss_pct
        if side == "buy":
            return round(price * (1 - pct), 2)
        return round(price * (1 + pct), 2)

    def _default_target(self, price: float, side: str) -> float:
        pct = self.cfg.trading.take_profit_pct
        if side == "buy":
            return round(price * (1 + pct), 2)
        return round(price * (1 - pct), 2)

    def _log_trade(self, result: dict, signal: TradeSignal):
        """Log trade to database."""
        try:
            from database.db import get_db
            db = get_db()
            db.execute_insert(
                """INSERT INTO trades
                   (timestamp_utc, symbol, side, quantity, price_aud, notional_aud,
                    fee_aud, variant, dry_run)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    result.get("timestamp_utc"),
                    signal.symbol,
                    signal.side,
                    result.get("quantity"),
                    result.get("fill_price_aud"),
                    result.get("notional_aud"),
                    result.get("fee_aud", 0),
                    signal.variant,
                    result.get("dry_run", True),
                ),
            )
        except Exception as e:
            logger.warning("Failed to log trade to DB: %s", e)


# Singleton
_trader: Trader | None = None


def get_trader() -> Trader:
    global _trader
    if _trader is None:
        _trader = Trader()
    return _trader
