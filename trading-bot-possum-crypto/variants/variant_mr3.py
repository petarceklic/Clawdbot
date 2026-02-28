"""
Possum Crypto -- Variant MR3: Fear & Greed Contrarian
Buy when FGI < 20, sell when FGI > 80.
Longest hold period of the mean reversion variants -- pure sentiment extremes.

Active in: EXTREME_FEAR, BEARISH, NEUTRAL, EXTREME_GREED regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_mr3")


class VariantMR3(BaseVariant):
    variant_code = "MR3"
    variant_name = "Fear & Greed Contrarian"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        fgi_value = regime_data.get("fgi_value")
        regime = regime_data.get("regime", "NEUTRAL")
        confidence = self._grok_confidence(grok_response)

        # Guard: required data
        if price is None or fgi_value is None:
            return None

        fear_threshold = self.cfg.regime.fgi_extreme_fear    # 20
        greed_threshold = self.cfg.regime.fgi_extreme_greed  # 80

        # BUY: extreme fear (FGI < 20) -- be greedy when others are fearful
        if fgi_value < fear_threshold:
            logger.info(
                "[MR3] %s BUY -- FGI %d (extreme fear), contrarian buy",
                symbol, fgi_value,
            )
            return TradeSignal(
                symbol=symbol,
                variant="MR3",
                side="buy",
                confidence=max(confidence, 0.55),
                reasoning=f"Fear & Greed contrarian: FGI {fgi_value} extreme fear, buying the fear",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "buy"),
                suggested_target=self._target_price(price, "buy"),
            )

        # SELL: extreme greed (FGI > 80) -- be fearful when others are greedy
        if fgi_value > greed_threshold:
            logger.info(
                "[MR3] %s SELL -- FGI %d (extreme greed), contrarian sell",
                symbol, fgi_value,
            )
            return TradeSignal(
                symbol=symbol,
                variant="MR3",
                side="sell",
                confidence=max(confidence, 0.55),
                reasoning=f"Fear & Greed contrarian: FGI {fgi_value} extreme greed, reducing exposure",
                suggested_entry=price,
                suggested_stop=self._stop_price(price, "sell"),
                suggested_target=self._target_price(price, "sell"),
            )

        return None
