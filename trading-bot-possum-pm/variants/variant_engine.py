"""
Possum PM — Variant Engine
Loads and evaluates all PM strategy variants against a contract.

Unlike US/AU bots, PM has no regime filter — all variants are always active.
Each variant independently evaluates the same data and returns signals.
The engine collects all signals and returns them sorted by confidence.
"""

import logging

from variants.base_variant import PMTradeSignal
from variants.v1_velocity import VariantV1
from variants.v2_contrarian import VariantV2
from variants.v3_time_decay import VariantV3
from variants.v4_momentum import VariantV4
from variants.v5_calibration import VariantV5

logger = logging.getLogger("possum.pm.variant_engine")


class PMVariantEngine:
    """Evaluate all PM variants for a contract."""

    def __init__(self):
        self.variants = [
            VariantV1(),
            VariantV2(),
            VariantV3(),
            VariantV4(),
            VariantV5(),
        ]
        logger.info(
            "PM variant engine loaded: %d variants (%s)",
            len(self.variants),
            ", ".join(v.variant_code for v in self.variants),
        )

    def evaluate(
        self,
        contract: dict,
        velocity_ratio: float,
        manifold_prob: float | None,
        polymarket_price: float | None,
        grok_response: dict | None,
        price_history: list[dict] | None = None,
    ) -> list[PMTradeSignal]:
        """
        Run all variants against a contract.
        Returns list of PMTradeSignal sorted by confidence (highest first).
        """
        signals = []

        for variant in self.variants:
            try:
                signal = variant.evaluate(
                    contract=contract,
                    velocity_ratio=velocity_ratio,
                    manifold_prob=manifold_prob,
                    polymarket_price=polymarket_price,
                    grok_response=grok_response,
                    price_history=price_history,
                )
                if signal is not None:
                    signals.append(signal)
            except Exception as e:
                logger.error(
                    "Variant %s failed for %s: %s",
                    variant.variant_code, contract["id"], e,
                )

        # Sort by confidence (highest first)
        signals.sort(key=lambda s: s.confidence, reverse=True)

        if signals:
            logger.info(
                "Variants triggered for %s: %s",
                contract["id"],
                ", ".join(f"{s.variant}({s.direction},{s.confidence:.2f})" for s in signals),
            )

        return signals


# Singleton
_engine: PMVariantEngine | None = None


def get_pm_variant_engine() -> PMVariantEngine:
    global _engine
    if _engine is None:
        _engine = PMVariantEngine()
    return _engine
