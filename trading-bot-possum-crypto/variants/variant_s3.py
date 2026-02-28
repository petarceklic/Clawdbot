"""
Possum Crypto -- Variant S3: Grok Contrarian
Fade Grok at moderate confidence (0.4-0.6) when technicals disagree.
When Grok is unsure and technicals point the other way, trust the charts.

Active in: NEUTRAL, BULLISH regimes only.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_s3")


class VariantS3(BaseVariant):
    variant_code = "S3"
    variant_name = "Grok Contrarian"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        rsi = indicators.get("rsi")
        ema_signal = indicators.get("ema_signal")
        macd_signal = indicators.get("macd_signal")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if price is None or rsi is None:
            return None

        # Only act when Grok is moderately confident (uncertain zone)
        conf_low, conf_high = self.cfg.variants.s3_confidence_range  # (0.4, 0.6)
        if not (conf_low <= confidence <= conf_high):
            return None

        if grok_dir == "FLAT":
            return None

        # Count technicals that DISAGREE with Grok
        if grok_dir == "LONG":
            # Grok says LONG but technicals say bearish -- fade Grok, go SHORT
            tech_disagrees = 0
            if rsi < 50:
                tech_disagrees += 1
            if ema_signal == "bearish":
                tech_disagrees += 1
            if macd_signal == "bearish":
                tech_disagrees += 1

            if tech_disagrees >= 2:
                reasons = []
                if rsi < 50:
                    reasons.append(f"RSI {rsi:.1f} bearish")
                if ema_signal == "bearish":
                    reasons.append("EMA bearish")
                if macd_signal == "bearish":
                    reasons.append("MACD bearish")

                logger.info(
                    "[S3] %s SELL -- fading Grok LONG (conf %.2f), technicals disagree: %s",
                    symbol, confidence, ", ".join(reasons),
                )
                return TradeSignal(
                    symbol=symbol,
                    variant="S3",
                    side="sell",
                    confidence=1 - confidence,  # Invert -- lower Grok conf = higher contrarian conf
                    reasoning=f"Contrarian: fading Grok LONG (conf {confidence:.2f}), technicals disagree ({', '.join(reasons)})",
                    suggested_entry=price,
                    suggested_stop=self._stop_price(price, "sell"),
                    suggested_target=self._target_price(price, "sell"),
                )

        elif grok_dir == "SHORT":
            # Grok says SHORT but technicals say bullish -- fade Grok, go LONG
            tech_disagrees = 0
            if rsi > 50:
                tech_disagrees += 1
            if ema_signal == "bullish":
                tech_disagrees += 1
            if macd_signal == "bullish":
                tech_disagrees += 1

            if tech_disagrees >= 2:
                reasons = []
                if rsi > 50:
                    reasons.append(f"RSI {rsi:.1f} bullish")
                if ema_signal == "bullish":
                    reasons.append("EMA bullish")
                if macd_signal == "bullish":
                    reasons.append("MACD bullish")

                logger.info(
                    "[S3] %s BUY -- fading Grok SHORT (conf %.2f), technicals disagree: %s",
                    symbol, confidence, ", ".join(reasons),
                )
                return TradeSignal(
                    symbol=symbol,
                    variant="S3",
                    side="buy",
                    confidence=1 - confidence,
                    reasoning=f"Contrarian: fading Grok SHORT (conf {confidence:.2f}), technicals disagree ({', '.join(reasons)})",
                    suggested_entry=price,
                    suggested_stop=self._stop_price(price, "buy"),
                    suggested_target=self._target_price(price, "buy"),
                )

        return None
