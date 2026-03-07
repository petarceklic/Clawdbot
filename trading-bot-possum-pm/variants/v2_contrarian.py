"""
Possum PM — V2 Contrarian Variant
Inverts V1's direction when Grok's confidence is moderate.

Logic: When Grok says enter_yes, V2 says NO (and vice versa).
Only triggers when confidence is in the moderate zone (0.55-0.75) —
if Grok is very confident, don't fight it; if too low, signal is noise.

Why: Prediction markets overshoot on headlines. When GDELT spikes and Grok
reacts, the initial move is often too large. Contrarian fades that overreaction.
"""

import logging

from variants.base_variant import PMBaseVariant, PMTradeSignal

logger = logging.getLogger("possum.pm.variant_v2")

# Only invert moderate confidence — don't fight extreme signals
CONFIDENCE_MIN = 0.55
CONFIDENCE_MAX = 0.88  # raised from 0.75 — Grok typically returns 0.80-0.85


class VariantV2(PMBaseVariant):
    variant_code = "V2"
    variant_name = "Contrarian"

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

        if action not in ("enter_yes", "enter_no"):
            return None

        # Only invert moderate confidence signals
        if confidence < CONFIDENCE_MIN or confidence > CONFIDENCE_MAX:
            logger.debug(
                "[V2] %s — confidence %.2f outside contrarian band (%.2f-%.2f)",
                contract["id"], confidence, CONFIDENCE_MIN, CONFIDENCE_MAX,
            )
            return None

        # Invert: Grok says YES → we say NO, and vice versa
        if action == "enter_yes":
            direction = "no"
        else:
            direction = "yes"

        # Contrarian confidence is lower — we're fading, not leading
        contrarian_confidence = confidence * 0.8

        logger.info(
            "[V2] %s TRIGGERED — Grok said %s → contrarian %s (conf=%.2f→%.2f)",
            contract["id"], action.replace("enter_", "").upper(),
            direction.upper(), confidence, contrarian_confidence,
        )

        return PMTradeSignal(
            contract_id=contract["id"],
            variant="V2",
            direction=direction,
            confidence=contrarian_confidence,
            reasoning=f"Contrarian fade: Grok said {action} but confidence is moderate ({confidence:.2f})",
        )
