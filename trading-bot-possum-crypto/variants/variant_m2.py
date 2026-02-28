"""
Possum Crypto -- Variant M2: RSI Momentum
Buy when RSI crosses above 50 from below with Grok bullish confirmation.
Sell when RSI drops below 50.

Active in: BULLISH, NEUTRAL regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_m2")


class VariantM2(BaseVariant):
    variant_code = "M2"
    variant_name = "RSI Momentum"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        rsi = indicators.get("rsi")
        rsi_prev = indicators.get("rsi_prev")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if any(v is None for v in (price, rsi, rsi_prev)):
            return None

        rsi_line = self.cfg.variants.rsi_momentum_line  # 50
        min_conf = self.cfg.variants.momentum_min_confidence

        # BUY: RSI crossed above 50 from below + Grok bullish
        if rsi_prev < rsi_line and rsi >= rsi_line and grok_dir == "LONG" and confidence >= min_conf:
            logger.info(
                "[M2] %s BUY -- RSI crossed above 50 (%.1f -> %.1f), Grok LONG (conf %.2f)",
                symbol, rsi_prev, rsi, confidence,
            )
            return TradeSignal(
                symbol=symbol,
                variant="M2",
                side="buy",
                confidence=confidence,
                reasoning=f"RSI momentum: crossed above 50 ({rsi_prev:.1f} -> {rsi:.1f}), Grok LONG",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        # SELL: RSI dropped below 50
        if rsi_prev >= rsi_line and rsi < rsi_line:
            logger.info("[M2] %s SELL -- RSI dropped below 50 (%.1f -> %.1f)", symbol, rsi_prev, rsi)
            return TradeSignal(
                symbol=symbol,
                variant="M2",
                side="sell",
                confidence=max(confidence, 0.5),
                reasoning=f"RSI momentum lost: dropped below 50 ({rsi_prev:.1f} -> {rsi:.1f})",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        return None
