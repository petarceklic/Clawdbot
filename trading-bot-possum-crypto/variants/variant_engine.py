"""
Possum Crypto -- Variant Engine
Iterates through active variants, collects all signals that trigger.
No R2 relative strength filter (only 3 assets, all get evaluated).
"""

import logging

from variants.base_variant import BaseVariant, TradeSignal

logger = logging.getLogger("possum.crypto.variant_engine")


def _load_all_variants() -> list[BaseVariant]:
    """Lazily import and instantiate all 10 variants."""
    from variants.variant_m1 import VariantM1
    from variants.variant_m2 import VariantM2
    from variants.variant_m3 import VariantM3
    from variants.variant_m4 import VariantM4
    from variants.variant_mr1 import VariantMR1
    from variants.variant_mr2 import VariantMR2
    from variants.variant_mr3 import VariantMR3
    from variants.variant_s1 import VariantS1
    from variants.variant_s2 import VariantS2
    from variants.variant_s3 import VariantS3

    return [
        VariantM1(), VariantM2(), VariantM3(), VariantM4(),
        VariantMR1(), VariantMR2(), VariantMR3(),
        VariantS1(), VariantS2(), VariantS3(),
    ]


class VariantEngine:
    """Evaluates all active variants against a single Grok response."""

    def __init__(self):
        self._variants = _load_all_variants()

    def evaluate(
        self,
        symbol: str,
        indicators: dict,
        grok_response: dict,
        regime_data: dict,
        active_variants: list[str],
    ) -> list[TradeSignal]:
        """
        Run all active variants against the Grok response.
        Returns list of TradeSignals from variants that triggered.

        active_variants: variant codes allowed by regime filter
        """
        signals = []

        for variant in self._variants:
            code = variant.variant_code

            # Skip if not active in current regime
            if code not in active_variants:
                continue

            try:
                signal = variant.evaluate(symbol, indicators, grok_response, regime_data)
                if signal is not None:
                    signals.append(signal)
                    logger.info(
                        "  Variant %s triggered for %s: %s (confidence: %.2f)",
                        code, symbol, signal.side, signal.confidence,
                    )
            except Exception as e:
                logger.error("Variant %s failed for %s: %s", code, symbol, e)

        return signals


# Singleton
_engine: VariantEngine | None = None


def get_variant_engine() -> VariantEngine:
    global _engine
    if _engine is None:
        _engine = VariantEngine()
    return _engine
