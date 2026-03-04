"""
Possum PM — V1 News Velocity Variant
The original PM strategy, extracted into variant form.

Logic: When Grok evaluates a contract and recommends enter_yes or enter_no
with sufficient confidence, take the trade. This is the "Grok says go" variant.

Requires: Grok response with action in (enter_yes, enter_no) and confidence >= 0.60
"""

import logging

from variants.base_variant import PMBaseVariant, PMTradeSignal

logger = logging.getLogger("possum.pm.variant_v1")

MIN_CONFIDENCE = 0.60


class VariantV1(PMBaseVariant):
    variant_code = "V1"
    variant_name = "News Velocity"

    def evaluate(
        self,
        contract: dict,
        velocity_ratio: float,
        manifold_prob: float | None,
        polymarket_price: float | None,
        grok_response: dict | None,
        price_history: list[dict] | None = None,
    ) -> PMTradeSignal | None:
        if grok_response is None:
            return None

        action = grok_response.get("action", "pass")
        confidence = grok_response.get("confidence", 0)
        reasoning = grok_response.get("reasoning", "")

        if action not in ("enter_yes", "enter_no"):
            return None

        if confidence < MIN_CONFIDENCE:
            logger.debug(
                "[V1] %s — Grok confidence %.2f below threshold %.2f",
                contract["id"], confidence, MIN_CONFIDENCE,
            )
            return None

        direction = "yes" if action == "enter_yes" else "no"

        logger.info(
            "[V1] %s TRIGGERED — %s (Grok confidence=%.2f, velocity=%.1fx)",
            contract["id"], direction.upper(), confidence, velocity_ratio,
        )

        return PMTradeSignal(
            contract_id=contract["id"],
            variant="V1",
            direction=direction,
            confidence=confidence,
            reasoning=f"Grok recommends {direction} (conf={confidence:.2f}): {reasoning[:100]}",
        )
