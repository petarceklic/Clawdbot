"""
Possum Crypto -- Variant M3: Breakout Momentum
Buy when price breaks above 7-day high with volume > 1.5x average + Grok bullish.

Active in: BULLISH, NEUTRAL regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_m3")


class VariantM3(BaseVariant):
    variant_code = "M3"
    variant_name = "Breakout Momentum"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        high_7d = indicators.get("high_7d")
        volume_ratio = indicators.get("volume_ratio")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if any(v is None for v in (price, high_7d, volume_ratio)):
            return None

        min_conf = self.cfg.variants.momentum_min_confidence
        vol_threshold = self.cfg.variants.volume_breakout_ratio  # 1.5

        # BUY: price > 7-day high + volume > 1.5x + Grok bullish
        if (
            price > high_7d
            and volume_ratio >= vol_threshold
            and grok_dir == "LONG"
            and confidence >= min_conf
        ):
            logger.info(
                "[M3] %s BUY -- breakout above 7d high %.2f, vol %.1fx, Grok LONG (conf %.2f)",
                symbol, high_7d, volume_ratio, confidence,
            )
            return TradeSignal(
                symbol=symbol,
                variant="M3",
                side="buy",
                confidence=confidence,
                reasoning=(
                    f"Breakout: price {price:.2f} above 7d high {high_7d:.2f}, "
                    f"volume {volume_ratio:.1f}x avg, Grok LONG"
                ),
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        return None
