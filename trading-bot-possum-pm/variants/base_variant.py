"""
Possum PM — Base Variant for Prediction Market Strategies

Unlike US/AU variants (price/volume/ATR space), PM variants operate in
probability space (0.0-1.0) and evaluate per-contract rather than per-stock.
"""

from dataclasses import dataclass


@dataclass
class PMTradeSignal:
    """Signal from a PM variant."""
    contract_id: str
    variant: str          # e.g. "V1", "V2"
    direction: str        # "yes" or "no"
    confidence: float     # 0.0-1.0
    reasoning: str        # why this variant triggered


class PMBaseVariant:
    """Base class for prediction market strategy variants."""

    variant_code: str = ""
    variant_name: str = ""

    def evaluate(
        self,
        contract: dict,
        velocity_ratio: float,
        manifold_prob: float | None,
        polymarket_price: float | None,
        grok_response: dict | None,
        price_history: list[dict] | None = None,
    ) -> PMTradeSignal | None:
        """
        Evaluate a contract and return a trade signal or None.

        Args:
            contract: Contract dict from contracts.json
            velocity_ratio: Article velocity vs 30-day baseline
            manifold_prob: Manifold Markets probability (0.0-1.0)
            polymarket_price: Polymarket YES price (0.0-1.0)
            grok_response: Full Grok evaluation response dict
            price_history: List of {"timestamp": str, "price": float} for momentum

        Returns:
            PMTradeSignal or None if no trade.
        """
        raise NotImplementedError
