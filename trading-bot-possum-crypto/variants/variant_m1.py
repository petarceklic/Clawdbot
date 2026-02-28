"""
Possum Crypto -- Variant M1: EMA Crossover Momentum
Buy when EMA25 crosses above EMA50 with Grok bullish confirmation (confidence >= 0.6).
Sell when EMA25 crosses below EMA50.

Active in: BULLISH, NEUTRAL regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_m1")


class VariantM1(BaseVariant):
    variant_code = "M1"
    variant_name = "EMA Crossover Momentum"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        ema_crossover = indicators.get("ema_crossover")
        ema_signal = indicators.get("ema_signal")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if price is None or ema_signal is None:
            return None

        min_conf = self.cfg.variants.momentum_min_confidence

        # BUY: EMA25 just crossed above EMA50 + Grok bullish
        if ema_crossover == "bullish" and grok_dir == "LONG" and confidence >= min_conf:
            logger.info(
                "[M1] %s BUY -- EMA bullish crossover, Grok LONG (conf %.2f)",
                symbol, confidence,
            )
            return TradeSignal(
                symbol=symbol,
                variant="M1",
                side="buy",
                confidence=confidence,
                reasoning=f"EMA25/50 bullish crossover, Grok LONG confidence {confidence:.2f}",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        # SELL: EMA25 just crossed below EMA50
        if ema_crossover == "bearish" and ema_signal == "bearish":
            logger.info("[M1] %s SELL -- EMA bearish crossover", symbol)
            return TradeSignal(
                symbol=symbol,
                variant="M1",
                side="sell",
                confidence=max(confidence, 0.5),
                reasoning="EMA25/50 bearish crossover -- exit momentum position",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        return None
