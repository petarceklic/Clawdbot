"""
Possum Crypto -- Variant S2: Grok + Technical Confirmation
Grok directional signal + at least 2 of (RSI, EMA, MACD) agree.
Higher threshold than S1 but more reliable -- technicals confirm AI view.

Active in: BEARISH, NEUTRAL, BULLISH regimes.
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_s2")


class VariantS2(BaseVariant):
    variant_code = "S2"
    variant_name = "Grok + Tech Confirm"

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

        min_conf = self.cfg.variants.s2_min_confidence  # 0.65

        if confidence < min_conf:
            return None

        if grok_dir == "FLAT":
            return None

        # Count how many technicals agree with Grok direction
        if grok_dir == "LONG":
            tech_agrees = 0
            # RSI bullish: above 50
            if rsi > 50:
                tech_agrees += 1
            # EMA bullish
            if ema_signal == "bullish":
                tech_agrees += 1
            # MACD bullish
            if macd_signal == "bullish":
                tech_agrees += 1

            if tech_agrees >= 2:
                confirmed_by = []
                if rsi > 50:
                    confirmed_by.append(f"RSI {rsi:.1f}")
                if ema_signal == "bullish":
                    confirmed_by.append("EMA bullish")
                if macd_signal == "bullish":
                    confirmed_by.append("MACD bullish")

                logger.info(
                    "[S2] %s BUY -- Grok LONG (conf %.2f) confirmed by %s",
                    symbol, confidence, ", ".join(confirmed_by),
                )
                return TradeSignal(
                    symbol=symbol,
                    variant="S2",
                    side="buy",
                    confidence=confidence,
                    reasoning=f"Grok LONG confirmed by {', '.join(confirmed_by)}",
                    suggested_entry=price,
                    suggested_stop=self._stop_price(price, "buy"),
                    suggested_target=self._target_price(price, "buy"),
                )

        elif grok_dir == "SHORT":
            tech_agrees = 0
            # RSI bearish: below 50
            if rsi < 50:
                tech_agrees += 1
            # EMA bearish
            if ema_signal == "bearish":
                tech_agrees += 1
            # MACD bearish
            if macd_signal == "bearish":
                tech_agrees += 1

            if tech_agrees >= 2:
                confirmed_by = []
                if rsi < 50:
                    confirmed_by.append(f"RSI {rsi:.1f}")
                if ema_signal == "bearish":
                    confirmed_by.append("EMA bearish")
                if macd_signal == "bearish":
                    confirmed_by.append("MACD bearish")

                logger.info(
                    "[S2] %s SELL -- Grok SHORT (conf %.2f) confirmed by %s",
                    symbol, confidence, ", ".join(confirmed_by),
                )
                return TradeSignal(
                    symbol=symbol,
                    variant="S2",
                    side="sell",
                    confidence=confidence,
                    reasoning=f"Grok SHORT confirmed by {', '.join(confirmed_by)}",
                    suggested_entry=price,
                    suggested_stop=self._stop_price(price, "sell"),
                    suggested_target=self._target_price(price, "sell"),
                )

        return None
