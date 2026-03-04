"""
Possum PM — V5 Calibration Variant
Multi-source probability alignment — the "consensus" trade.

Logic: Only trade when Grok's estimated probability, Manifold's forecaster
consensus, AND Polymarket's market price all agree on direction AND the
market price appears mispriced relative to the other two sources.

Why: When three independent probability sources agree, the signal is
much more reliable than any single source. The trade is: buy the
underpriced side per consensus.
"""

import logging

from variants.base_variant import PMBaseVariant, PMTradeSignal

logger = logging.getLogger("possum.pm.variant_v5")

# All three must agree within this band
ALIGNMENT_TOLERANCE_PP = 15.0   # percentage points between Grok & Manifold
MIN_MISPRICING_PP = 8.0         # market must be at least 8pp from consensus
MIN_CONFIDENCE = 0.65


class VariantV5(PMBaseVariant):
    variant_code = "V5"
    variant_name = "Calibration"

    def evaluate(
        self,
        contract: dict,
        velocity_ratio: float,
        manifold_prob: float | None,
        polymarket_price: float | None,
        grok_response: dict | None,
        price_history: list[dict] | None = None,
    ) -> PMTradeSignal | None:
        # Need all three sources
        if manifold_prob is None or polymarket_price is None or grok_response is None:
            return None

        grok_prob = grok_response.get("estimated_probability")
        if grok_prob is None:
            return None

        # Step 1: Check Grok and Manifold agree (within tolerance)
        grok_manifold_gap = abs(grok_prob - manifold_prob) * 100
        if grok_manifold_gap > ALIGNMENT_TOLERANCE_PP:
            logger.debug(
                "[V5] %s — Grok (%.0f%%) and Manifold (%.0f%%) disagree (%.0fpp gap > %.0fpp)",
                contract["id"], grok_prob * 100, manifold_prob * 100,
                grok_manifold_gap, ALIGNMENT_TOLERANCE_PP,
            )
            return None

        # Step 2: Consensus probability (average of Grok + Manifold)
        consensus = (grok_prob + manifold_prob) / 2.0

        # Step 3: Is Polymarket mispriced vs consensus?
        mispricing_pp = (consensus - polymarket_price) * 100  # positive → PM underpriced

        if abs(mispricing_pp) < MIN_MISPRICING_PP:
            logger.debug(
                "[V5] %s — Polymarket $%.2f is fair vs consensus %.0f%% (%.1fpp gap < %.0fpp)",
                contract["id"], polymarket_price, consensus * 100,
                abs(mispricing_pp), MIN_MISPRICING_PP,
            )
            return None

        # Step 4: Direction — buy the underpriced side
        if mispricing_pp > 0:
            # Consensus > Polymarket → PM underpriced → buy YES
            direction = "yes"
        else:
            # Consensus < Polymarket → PM overpriced → buy NO
            direction = "no"

        # Confidence based on mispricing magnitude + source agreement
        agreement_factor = 1.0 - (grok_manifold_gap / ALIGNMENT_TOLERANCE_PP)  # 0-1, higher = better agreement
        confidence = MIN_CONFIDENCE + (abs(mispricing_pp) / 100.0) + (agreement_factor * 0.1)
        confidence = min(confidence, 0.90)

        logger.info(
            "[V5] %s TRIGGERED — %s calibration (consensus=%.0f%%, PM=$%.2f, mispricing=%.1fpp, Grok/Manifold gap=%.1fpp)",
            contract["id"], direction.upper(),
            consensus * 100, polymarket_price,
            abs(mispricing_pp), grok_manifold_gap,
        )

        return PMTradeSignal(
            contract_id=contract["id"],
            variant="V5",
            direction=direction,
            confidence=confidence,
            reasoning=f"Calibration: consensus {consensus:.0%} vs PM ${polymarket_price:.2f} ({abs(mispricing_pp):.1f}pp gap)",
        )
