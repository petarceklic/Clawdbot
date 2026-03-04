"""
Possum PM — V3 Time Decay Variant
Bets on the favourite hardening as resolution date approaches.

Logic: When a contract is within 30 days of resolution and the market
shows a clear favourite (price > 0.65 or < 0.35), bet on the favourite
getting stronger. Pure time-based pressure — no Grok needed.

Why: Prediction markets exhibit "favourite-longshot bias" near resolution.
As uncertainty decreases, the favourite's price converges toward 1.0.
The closer to resolution, the stronger the effect.
"""

import logging
from datetime import datetime, timezone

from variants.base_variant import PMBaseVariant, PMTradeSignal

logger = logging.getLogger("possum.pm.variant_v3")

# Thresholds
MAX_DAYS_TO_RESOLUTION = 30
FAVOURITE_YES_THRESHOLD = 0.65   # YES price above this → bet YES
FAVOURITE_NO_THRESHOLD = 0.35    # YES price below this → bet NO
MIN_CONFIDENCE = 0.55


class VariantV3(PMBaseVariant):
    variant_code = "V3"
    variant_name = "Time Decay"

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

        # Need resolution date
        resolution_str = contract.get("resolution_date")
        if not resolution_str:
            return None

        try:
            resolution = datetime.strptime(resolution_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None

        now = datetime.now(timezone.utc)
        days_to_resolution = (resolution - now).days

        if days_to_resolution <= 0:
            return None  # already resolved or resolving today

        if days_to_resolution > MAX_DAYS_TO_RESOLUTION:
            logger.debug(
                "[V3] %s — %d days to resolution, too far (max %d)",
                contract["id"], days_to_resolution, MAX_DAYS_TO_RESOLUTION,
            )
            return None

        # Determine if there's a clear favourite
        direction = None
        if polymarket_price >= FAVOURITE_YES_THRESHOLD:
            direction = "yes"
        elif polymarket_price <= FAVOURITE_NO_THRESHOLD:
            direction = "no"
        else:
            logger.debug(
                "[V3] %s — price $%.2f in uncertain zone (%.2f-%.2f), no favourite",
                contract["id"], polymarket_price,
                FAVOURITE_NO_THRESHOLD, FAVOURITE_YES_THRESHOLD,
            )
            return None

        # Confidence scales with proximity to resolution
        # 30 days out → base confidence; 1 day out → max confidence
        time_factor = 1.0 - (days_to_resolution / MAX_DAYS_TO_RESOLUTION)  # 0.0 → 1.0
        confidence = MIN_CONFIDENCE + (time_factor * 0.35)  # range: 0.55 → 0.90

        # Manifold agreement bonus
        if manifold_prob is not None:
            if direction == "yes" and manifold_prob > 0.60:
                confidence = min(confidence + 0.05, 0.95)
            elif direction == "no" and manifold_prob < 0.40:
                confidence = min(confidence + 0.05, 0.95)

        logger.info(
            "[V3] %s TRIGGERED — %s favourite hardening (%d days to resolution, price=$%.2f, conf=%.2f)",
            contract["id"], direction.upper(), days_to_resolution, polymarket_price, confidence,
        )

        return PMTradeSignal(
            contract_id=contract["id"],
            variant="V3",
            direction=direction,
            confidence=confidence,
            reasoning=f"Time decay: {days_to_resolution}d to resolution, {direction} favourite at ${polymarket_price:.2f}",
        )
