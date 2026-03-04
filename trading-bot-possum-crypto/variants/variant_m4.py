"""
Possum Crypto -- Variant M4: ADX Momentum Breakout
Buys when crypto makes a clean breakout above range on volume during trending conditions.
Uses ADX to gate: only active when ADX > 25 (trending market).

This complements the MR (mean reversion) variants which work in ranging markets.
Two modes:
  - ADX > 25 (trending): M4 buys breakouts above 7d high on volume
  - ADX < 25 (ranging): M4 stays silent, MR variants handle ranging

Entry conditions:
  1. ADX > 25 (trending market)
  2. Price above 7d high (breakout)
  3. Volume >= 1.5x average (confirmation)
  4. MACD bullish (momentum confirmation)
  5. Grok LONG with confidence >= 0.6

Active in: ALL regimes (self-gates on ADX).
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_m4")

# ADX threshold for trending market
ADX_TRENDING_THRESHOLD = 25.0

# Volume confirmation threshold
VOLUME_BREAKOUT_RATIO = 1.5


class VariantM4(BaseVariant):
    variant_code = "M4"
    variant_name = "ADX Momentum Breakout"

    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        price = indicators.get("current_price")
        adx = indicators.get("adx")
        high_7d = indicators.get("high_7d")
        volume_ratio = indicators.get("volume_ratio")
        macd_signal = indicators.get("macd_signal")
        macd_histogram = indicators.get("macd_histogram")
        ema_signal = indicators.get("ema_signal")
        confidence = self._grok_confidence(grok_response)
        grok_dir = self._grok_signal(grok_response)

        # Guard: required data
        if any(v is None for v in (price, adx, high_7d, volume_ratio)):
            return None

        # --- Core gate: ADX must show trending market ---
        if adx < ADX_TRENDING_THRESHOLD:
            logger.debug(
                "[M4] %s -- ADX %.1f < %.1f (ranging market, deferring to MR variants)",
                symbol, adx, ADX_TRENDING_THRESHOLD,
            )
            return None

        # --- BUY: Breakout above 7-day high ---
        # Price must be at or above the 7-day high
        if price < high_7d * 0.998:  # Allow 0.2% tolerance
            logger.debug(
                "[M4] %s -- price %.2f below 7d high %.2f (no breakout)",
                symbol, price, high_7d,
            )
            return None

        # Volume confirmation: must be above average
        if volume_ratio < VOLUME_BREAKOUT_RATIO:
            logger.debug(
                "[M4] %s -- volume ratio %.2f < %.1f (weak breakout)",
                symbol, volume_ratio, VOLUME_BREAKOUT_RATIO,
            )
            return None

        # MACD must be bullish (momentum confirmation)
        if macd_signal == "bearish":
            logger.debug("[M4] %s -- MACD bearish, breakout lacks momentum", symbol)
            return None

        # Grok must agree (LONG direction with decent confidence)
        min_conf = self.cfg.variants.momentum_min_confidence
        if grok_dir != "LONG" or confidence < min_conf:
            logger.debug(
                "[M4] %s -- Grok %s conf=%.2f (need LONG >= %.2f)",
                symbol, grok_dir, confidence, min_conf,
            )
            return None

        # --- All conditions met: breakout in trending market ---
        # Use a tighter stop (3% below entry) and wider target (15%)
        # since trending markets can run further
        stop = round(price * 0.97, 2)    # 3% stop (tighter than default 5%)
        target = round(price * 1.15, 2)  # 15% target (wider than default 10%)

        logger.info(
            "[M4] %s BUY -- ADX=%.1f (trending), price %.2f >= 7d high %.2f, "
            "vol=%.1fx, MACD=%s, Grok LONG (conf=%.2f)",
            symbol, adx, price, high_7d, volume_ratio, macd_signal, confidence,
        )

        return TradeSignal(
            symbol=symbol,
            variant="M4",
            side="buy",
            confidence=confidence,
            reasoning=(
                f"ADX momentum breakout: ADX={adx:.1f} (trending), "
                f"price ${price:.2f} above 7d high ${high_7d:.2f}, "
                f"volume {volume_ratio:.1f}x, MACD {macd_signal}, "
                f"Grok LONG confidence {confidence:.2f}"
            ),
            suggested_entry=price,
            suggested_stop=stop,
            suggested_target=target,
        )
