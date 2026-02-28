"""
Possum Crypto -- Base Variant
Abstract base class for all 9 crypto strategy variants.
Each variant is cheap Python logic applied to a Grok response -- zero API cost.

Crypto differences from US/AU:
- No ATR-based stops (crypto ATR varies wildly) -- uses percentage-based stops
- No relative strength filter (only 3 assets)
- No earnings calendar
- Regime from Fear & Greed, not SPY/VIX
"""

import abc
from dataclasses import dataclass


@dataclass
class TradeSignal:
    """Returned by a variant when it triggers a trade."""
    symbol: str
    variant: str          # e.g. "M1", "MR2", "S3"
    side: str             # "buy" or "sell"
    confidence: float     # 0.0 - 1.0
    reasoning: str
    suggested_entry: float | None = None
    suggested_stop: float | None = None
    suggested_target: float | None = None


class BaseVariant(abc.ABC):
    """Abstract base for all crypto strategy variants."""

    # Subclasses must set these
    variant_code: str = ""
    variant_name: str = ""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()

    @abc.abstractmethod
    def evaluate(
        self, symbol: str, indicators: dict, grok_response: dict, regime_data: dict,
    ) -> TradeSignal | None:
        """
        Evaluate whether this variant should trigger a trade.
        Returns TradeSignal if yes, None if no.

        symbol: e.g. "BTC/AUD"
        indicators: technical indicators dict from get_all_indicators()
        grok_response: parsed JSON from Grok API call
        regime_data: regime filter output (fgi_value, regime, btc_dominance, etc.)
        """
        ...

    # -- Grok response helpers --

    def _grok_signal(self, grok: dict) -> str:
        """Get overall signal: LONG, SHORT, or FLAT."""
        return str(grok.get("overall_signal", "FLAT")).upper()

    def _grok_confidence(self, grok: dict) -> float:
        return float(grok.get("confidence", 0))

    def _grok_sentiment(self, grok: dict) -> dict:
        return grok.get("sentiment", {})

    def _grok_technical(self, grok: dict) -> dict:
        return grok.get("technical", {})

    # -- Price helpers --

    def _stop_price(self, entry: float, side: str) -> float:
        """Calculate stop price using percentage-based stop (5% default)."""
        pct = self.cfg.trading.stop_loss_pct
        if side == "buy":
            return round(entry * (1 - pct), 2)
        else:
            return round(entry * (1 + pct), 2)

    def _target_price(self, entry: float, side: str) -> float:
        """Calculate target price using percentage-based target (10% default)."""
        pct = self.cfg.trading.take_profit_pct
        if side == "buy":
            return round(entry * (1 + pct), 2)
        else:
            return round(entry * (1 - pct), 2)
