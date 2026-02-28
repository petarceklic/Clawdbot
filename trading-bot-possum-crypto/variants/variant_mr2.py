"""
Possum Crypto -- Variant MR2: RSI Extreme Reversion
Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought).
Only in NEUTRAL or EXTREME regimes.

Active in: NEUTRAL, EXTREME_FEAR, BEARISH, EXTREME_GREED regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_mr2")


class VariantMR2(BaseVariant):
    variant_code = "MR2"
    variant_name = "RSI Extreme Reversion"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        rsi = indicators.get("rsi")
        confidence = self._grok_confidence(grok_response)
        regime = regime_data.get("regime", "NEUTRAL")

        # Guard: required data
        if any(v is None for v in (price, rsi)):
            return None

        oversold = self.cfg.variants.rsi_oversold    # 30
        overbought = self.cfg.variants.rsi_overbought  # 70

        # SELL in EXTREME_GREED when RSI > 70
        if regime == "EXTREME_GREED" and rsi > overbought:
            logger.info("[MR2] %s SELL -- RSI %.1f overbought in EXTREME_GREED", symbol, rsi)
            return TradeSignal(
                symbol=symbol,
                variant="MR2",
                side="sell",
                confidence=max(confidence, 0.6),
                reasoning=f"RSI extreme: {rsi:.1f} overbought in {regime} regime",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        # BUY when RSI < 30 (in EXTREME_FEAR, BEARISH, or NEUTRAL)
        if rsi < oversold and regime != "EXTREME_GREED":
            logger.info("[MR2] %s BUY -- RSI %.1f oversold in %s", symbol, rsi, regime)
            return TradeSignal(
                symbol=symbol,
                variant="MR2",
                side="buy",
                confidence=max(confidence, 0.5),
                reasoning=f"RSI extreme: {rsi:.1f} oversold in {regime} regime",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        # SELL when RSI > 70 (any regime where MR2 is active)
        if rsi > overbought:
            logger.info("[MR2] %s SELL -- RSI %.1f overbought", symbol, rsi)
            return TradeSignal(
                symbol=symbol,
                variant="MR2",
                side="sell",
                confidence=max(confidence, 0.5),
                reasoning=f"RSI extreme: {rsi:.1f} overbought",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        return None
