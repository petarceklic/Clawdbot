"""
Possum Crypto -- Variant S1: Grok Directional
Pure Grok signal at high confidence (> 0.7). Trust the AI.

Active in: BEARISH, NEUTRAL, BULLISH regimes (always active except extremes).
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_s1")


class VariantS1(BaseVariant):
    variant_code = "S1"
    variant_name = "Grok Directional"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if price is None:
            return None

        min_conf = self.cfg.variants.sentiment_min_confidence  # 0.7

        # Only act on high-confidence directional signals
        if confidence < min_conf:
            return None

        if grok_dir == "FLAT":
            return None

        if grok_dir == "LONG":
            logger.info(
                "[S1] %s BUY -- Grok LONG, high confidence %.2f", symbol, confidence,
            )
            return TradeSignal(
                symbol=symbol,
                variant="S1",
                side="buy",
                confidence=confidence,
                reasoning=f"Grok directional: LONG with confidence {confidence:.2f}",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        if grok_dir == "SHORT":
            logger.info(
                "[S1] %s SELL -- Grok SHORT, high confidence %.2f", symbol, confidence,
            )
            return TradeSignal(
                symbol=symbol,
                variant="S1",
                side="sell",
                confidence=confidence,
                reasoning=f"Grok directional: SHORT with confidence {confidence:.2f}",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        return None
