"""
Possum Crypto -- Variant MR1: Bollinger Band Reversion
Buy at lower Bollinger Band when not trending + Grok not bearish.
Target: middle band (20-period SMA).

Active in: NEUTRAL, EXTREME_FEAR, BEARISH, EXTREME_GREED regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_mr1")


class VariantMR1(BaseVariant):
    variant_code = "MR1"
    variant_name = "Bollinger Reversion"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        bb_lower = indicators.get("bb_lower")
        bb_middle = indicators.get("bb_middle")
        bb_position = indicators.get("bb_position")
        adx = indicators.get("adx")
        grok_dir = self._grok_signal(grok_response)
        confidence = self._grok_confidence(grok_response)
        regime = regime_data.get("regime", "NEUTRAL")

        # Guard: required data
        if any(v is None for v in (price, bb_lower, bb_middle)):
            return None

        # Don't buy in EXTREME_GREED (MR variants sell in extreme greed)
        if regime == "EXTREME_GREED":
            # SELL signal: price at upper band in extreme greed
            bb_upper = indicators.get("bb_upper")
            if bb_position == "above_upper" and bb_upper is not None:
                logger.info("[MR1] %s SELL -- above upper BB in EXTREME_GREED", symbol)
                return TradeSignal(
                    symbol=symbol,
                    variant="MR1",
                    side="sell",
                    confidence=max(confidence, 0.6),
                    reasoning=f"Bollinger reversion sell: price above upper band in EXTREME_GREED regime",
                    suggested_entry=price,
                    suggested_stop=self._stop_price(price, "sell"),
                    suggested_target=bb_middle,
                )
            return None

        # BUY: price at or below lower Bollinger Band
        if bb_position != "below_lower" and price > bb_lower:
            return None

        # Not strongly trending (ADX < 25 means range-bound, good for reversion)
        if adx is not None and adx > 30:
            logger.debug("[MR1] %s -- ADX %.1f too high, strong trend", symbol, adx)
            return None

        # Grok not bearish (don't catch a falling knife)
        if grok_dir == "SHORT":
            logger.debug("[MR1] %s -- Grok SHORT, skipping mean reversion buy", symbol)
            return None

        # Target: middle band
        target = bb_middle

        logger.info(
            "[MR1] %s BUY -- price %.2f at lower BB %.2f, target middle %.2f",
            symbol, price, bb_lower, target,
        )
        return TradeSignal(
            symbol=symbol,
            variant="MR1",
            side="buy",
            confidence=max(confidence, 0.5),
            reasoning=f"Bollinger reversion: price {price:.2f} at lower band {bb_lower:.2f}, target middle {target:.2f}",
            suggested_entry=price,
            suggested_stop=self._stop_price(price, "buy"),
            suggested_target=round(target, 2),
        )
