"""
Possum Crypto -- Orchestrator
Main analysis pipeline (synchronous -- only 3 assets):

  Check open positions (update prices, check stops/TPs)
    -> Regime filter (Fear & Greed)
    -> For each asset in universe:
       -> Skip if open position exists
       -> Fetch OHLCV + ticker
       -> Calculate technicals
       -> Grok API call
       -> Variant engine (9 strategies filtered by regime)
       -> Execute best signal (dry-run or live)
       -> Log signals + trades + open position
    -> Write daily results JSON
"""

import logging

from agent.grok_agent import get_grok_agent
from data.market_data import fetch_ohlcv, fetch_ticker, fetch_all_tickers
from data.technical_indicators import get_all_indicators
from execution.trader import get_trader
from filters.regime_filter import get_current_regime
from tracking.trade_logger import get_trade_logger
from variants.variant_engine import get_variant_engine

logger = logging.getLogger("possum.crypto.orchestrator")


class Orchestrator:
    """Crypto analysis pipeline -- sequential (3 assets, no async needed)."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()

    def run_cycle(self) -> dict:
        """
        Run one complete analysis cycle across the crypto universe.
        Returns summary dict with results per asset and any trades.
        """
        logger.info("=" * 60)
        logger.info("CRYPTO ANALYSIS CYCLE STARTING")
        logger.info("=" * 60)

        trader = get_trader()
        trade_logger = get_trade_logger()

        # 0. Update open positions and check stops/TPs
        positions_closed = self._check_open_positions(trader)

        # 1. Regime filter
        regime_data = get_current_regime()
        regime = regime_data["regime"]
        active_variants = regime_data["active_variants"]
        logger.info(
            "Market regime: %s | Active variants: %s",
            regime, ", ".join(active_variants),
        )

        if not active_variants:
            logger.info("No variants active -- skipping cycle")
            return {"status": "no_active_variants", "regime": regime, "results": []}

        # 2. Process each asset
        grok = get_grok_agent()
        engine = get_variant_engine()

        results = []
        trades_placed = 0
        universe = self.cfg.trading.universe

        for symbol in universe:
            # Skip if already holding an open position
            if trader.has_open_position(symbol):
                logger.info("Skipping %s -- open position exists", symbol)
                results.append({
                    "symbol": symbol,
                    "action": "skipped",
                    "reason": "open_position_exists",
                })
                continue

            try:
                result = self._process_asset(
                    symbol=symbol,
                    regime_data=regime_data,
                    active_variants=active_variants,
                    grok=grok,
                    engine=engine,
                    trader=trader,
                    trade_logger=trade_logger,
                )
                results.append(result)
                if result.get("action") in ("simulated_fill", "trade_placed"):
                    trades_placed += 1
            except Exception as e:
                logger.error("Failed to process %s: %s", symbol, e)
                results.append({"symbol": symbol, "action": "error", "reason": str(e)})

        logger.info(
            "CYCLE COMPLETE: %d assets processed, %d trades, %d positions closed | Regime: %s",
            len(results), trades_placed, len(positions_closed), regime,
        )

        # 3. Get position summary for results
        position_summary = trade_logger.get_position_summary()

        # 4. Write daily results
        cycle_summary = {
            "status": "completed",
            "regime": regime,
            "fgi_value": regime_data.get("fgi_value"),
            "fgi_label": regime_data.get("fgi_label"),
            "btc_dominance": regime_data.get("btc_dominance"),
            "assets_processed": len(results),
            "trades_placed": trades_placed,
            "positions_closed": positions_closed,
            "open_positions": position_summary,
            "results": results,
        }

        try:
            trade_logger.write_daily_results(cycle_summary)
        except Exception as e:
            logger.error("Failed to write daily results: %s", e)

        return cycle_summary

    def _check_open_positions(self, trader) -> list[dict]:
        """Update prices on open positions and close any that hit stop/TP."""
        try:
            # Fetch current prices for all assets
            tickers = fetch_all_tickers(self.cfg.trading.universe)
            prices = {sym: t.get("last", 0) for sym, t in tickers.items() if t.get("last")}

            if not prices:
                return []

            # Update current prices and unrealised P&L
            trader.update_positions(prices)

            # Check stop-loss and take-profit
            closed = trader.check_stops_and_targets(prices)
            return closed

        except Exception as e:
            logger.error("Failed to check open positions: %s", e)
            return []

    def _process_asset(
        self,
        symbol: str,
        regime_data: dict,
        active_variants: list[str],
        grok,
        engine,
        trader,
        trade_logger,
    ) -> dict:
        """Process a single crypto asset through the full pipeline."""
        logger.info("-" * 40)
        logger.info("Processing %s", symbol)

        # Fetch market data
        df = fetch_ohlcv(symbol, timeframe="1h", limit=200)
        if df.empty or len(df) < 20:
            logger.warning("Insufficient data for %s (%d bars)", symbol, len(df))
            return {"symbol": symbol, "action": "skipped", "reason": "insufficient_data"}

        ticker = fetch_ticker(symbol)

        # Calculate technicals
        indicators = get_all_indicators(df, symbol)

        # Grok analysis
        grok_response = grok.analyze(symbol, indicators, regime_data)
        if grok_response is None:
            logger.warning("Grok analysis failed for %s", symbol)
            return {"symbol": symbol, "action": "error", "reason": "grok_failed"}

        grok_dir = grok_response.get("overall_signal", "FLAT")
        grok_conf = grok_response.get("confidence", 0)

        logger.info(
            "Grok: %s -> %s (conf %.2f)", symbol, grok_dir, grok_conf,
        )

        # Variant engine
        signals = engine.evaluate(
            symbol=symbol,
            indicators=indicators,
            grok_response=grok_response,
            regime_data=regime_data,
            active_variants=active_variants,
        )

        # Log all signals
        for sig in signals:
            trade_logger.log_signal(
                symbol=sig.symbol,
                variant=sig.variant,
                signal=sig.side,
                confidence=sig.confidence,
                grok_direction=grok_dir,
                grok_confidence=grok_conf,
                regime=regime_data.get("regime", "NEUTRAL"),
                fgi_value=regime_data.get("fgi_value"),
                price=indicators.get("current_price", 0),
                reasoning=sig.reasoning,
                executed=False,
            )

        if not signals:
            logger.info("No variants triggered for %s", symbol)
            return {
                "symbol": symbol,
                "action": "no_trade",
                "reason": "no_variant_triggered",
                "grok_signal": grok_dir,
                "grok_confidence": grok_conf,
            }

        # Execute the highest-confidence signal
        best = max(signals, key=lambda s: s.confidence)
        logger.info(
            "Best signal: %s %s (variant %s, conf %.2f)",
            best.side, symbol, best.variant, best.confidence,
        )

        trade_result = trader.execute_signal(best, ticker)

        # Mark executed signal in DB
        trade_logger.log_signal(
            symbol=best.symbol,
            variant=best.variant,
            signal=best.side,
            confidence=best.confidence,
            grok_direction=grok_dir,
            grok_confidence=grok_conf,
            regime=regime_data.get("regime", "NEUTRAL"),
            fgi_value=regime_data.get("fgi_value"),
            price=indicators.get("current_price", 0),
            reasoning=best.reasoning,
            executed=True,
        )

        return {
            "symbol": symbol,
            "action": trade_result.get("action", "error"),
            "variant": best.variant,
            "side": best.side,
            "confidence": best.confidence,
            "grok_signal": grok_dir,
            "grok_confidence": grok_conf,
            "trade_result": trade_result,
            "all_signals": [
                {"variant": s.variant, "side": s.side, "confidence": s.confidence}
                for s in signals
            ],
        }


# Singleton
_orchestrator: Orchestrator | None = None


def get_orchestrator() -> Orchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Orchestrator()
    return _orchestrator
