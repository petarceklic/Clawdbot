"""
Possum PM — V4 Momentum Variant
Follows sustained price moves in prediction markets.

Logic: When Polymarket price has moved consistently in one direction
across 3+ consecutive pipeline checks, follow the trend.

Why: Prediction markets trend when new information is being gradually
priced in. A steady 3-check move suggests real information, not noise.
"""

import logging

from variants.base_variant import PMBaseVariant, PMTradeSignal

logger = logging.getLogger("possum.pm.variant_v4")

MIN_CONSECUTIVE_MOVES = 3       # checks in same direction
MIN_TOTAL_MOVE_PP = 3.0         # minimum total move in percentage points
MIN_CONFIDENCE = 0.55
EXTREME_ZONE = 0.10             # don't chase if price already near 0 or 1


class VariantV4(PMBaseVariant):
    variant_code = "V4"
    variant_name = "Momentum"

    def evaluate(
        self,
        contract: dict,
        velocity_ratio: float,
        manifold_prob: float | None,
        polymarket_price: float | None,
        grok_response: dict | None,
        price_history: list[dict] | None = None,
    ) -> PMTradeSignal | None:
        if polymarket_price is None:
            return None

        if not price_history or len(price_history) < MIN_CONSECUTIVE_MOVES + 1:
            logger.debug(
                "[V4] %s — insufficient price history (%d points, need %d)",
                contract["id"],
                len(price_history) if price_history else 0,
                MIN_CONSECUTIVE_MOVES + 1,
            )
            return None

        # Don't chase into extreme prices (near 0 or 1)
        if polymarket_price < EXTREME_ZONE or polymarket_price > (1.0 - EXTREME_ZONE):
            logger.debug(
                "[V4] %s — price $%.2f in extreme zone, no room to run",
                contract["id"], polymarket_price,
            )
            return None

        # Check last N+1 prices for consistent direction
        recent = price_history[-(MIN_CONSECUTIVE_MOVES + 1):]
        prices = [p["price"] for p in recent]

        # Count consecutive moves in same direction
        ups = 0
        downs = 0
        for i in range(1, len(prices)):
            delta = prices[i] - prices[i - 1]
            if delta > 0.001:  # small threshold to avoid noise
                ups += 1
            elif delta < -0.001:
                downs += 1
            else:
                # flat → breaks the streak
                ups = 0
                downs = 0

        total_move_pp = abs(prices[-1] - prices[0]) * 100

        if total_move_pp < MIN_TOTAL_MOVE_PP:
            return None

        direction = None
        if ups >= MIN_CONSECUTIVE_MOVES:
            direction = "yes"  # price rising → bet YES
        elif downs >= MIN_CONSECUTIVE_MOVES:
            direction = "no"  # price falling → bet NO

        if direction is None:
            return None

        # Confidence based on strength of move
        confidence = min(MIN_CONFIDENCE + (total_move_pp / 30.0), 0.85)

        # Grok agreement bonus
        if grok_response:
            grok_direction = grok_response.get("direction", "neutral")
            if grok_direction == direction:
                confidence = min(confidence + 0.05, 0.90)

        logger.info(
            "[V4] %s TRIGGERED — %s momentum (%.1fpp move over %d checks, conf=%.2f)",
            contract["id"], direction.upper(), total_move_pp, len(prices) - 1, confidence,
        )

        return PMTradeSignal(
            contract_id=contract["id"],
            variant="V4",
            direction=direction,
            confidence=confidence,
            reasoning=f"Momentum: {total_move_pp:.1f}pp {direction} move over {len(prices)-1} checks",
        )
