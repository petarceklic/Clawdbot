"""
Possum Crypto -- Regime Filter
Fetches Fear & Greed Index from Alternative.me and classifies crypto market regime.
Controls which variants are active per regime via the REGIME_VARIANT_MATRIX.

Unlike US/AU (SPY/VIX/ADX), crypto uses Fear & Greed Index as the primary regime signal.
"""

import logging
from datetime import datetime, timezone

import requests

from config import REGIME_VARIANT_MATRIX
from utils.retry import retry_data_fetch

logger = logging.getLogger("possum.crypto.regime")

FGI_URL = "https://api.alternative.me/fng/?limit=1"
BTC_DOMINANCE_URL = "https://api.coingecko.com/api/v3/global"


def classify_regime(fgi_value: int) -> str:
    """
    Classify crypto market regime from Fear & Greed Index value (0-100).

    Returns one of: EXTREME_FEAR, BEARISH, NEUTRAL, BULLISH, EXTREME_GREED
    """
    from config import get_config
    cfg = get_config()

    if fgi_value < cfg.regime.fgi_extreme_fear:
        return "EXTREME_FEAR"
    elif fgi_value < cfg.regime.fgi_bearish:
        return "BEARISH"
    elif fgi_value < cfg.regime.fgi_bullish:
        return "NEUTRAL"
    elif fgi_value < cfg.regime.fgi_extreme_greed:
        return "BULLISH"
    else:
        return "EXTREME_GREED"


def get_active_variants(regime: str) -> list[str]:
    """Return list of variant codes active in the given regime."""
    return REGIME_VARIANT_MATRIX.get(regime, ["MR1", "MR2", "MR3"])


@retry_data_fetch
def fetch_fear_and_greed() -> dict:
    """
    Fetch current Fear & Greed Index from Alternative.me.

    Returns dict with: value (int), label (str), timestamp (str)
    Free API, no auth needed, updates daily.
    """
    resp = requests.get(FGI_URL, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    entry = data["data"][0]
    return {
        "value": int(entry["value"]),
        "label": entry["value_classification"],
        "timestamp": datetime.fromtimestamp(int(entry["timestamp"]), tz=timezone.utc).isoformat(),
    }


@retry_data_fetch
def fetch_btc_dominance() -> float | None:
    """
    Fetch BTC dominance percentage from CoinGecko free API.
    Returns float like 54.3 (percent) or None on failure.

    Used as additional context for Grok -- not a direct trading signal.
    """
    try:
        resp = requests.get(BTC_DOMINANCE_URL, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return round(data["data"]["market_cap_percentage"]["btc"], 2)
    except Exception as e:
        logger.warning("Failed to fetch BTC dominance: %s", e)
        return None


def get_current_regime() -> dict:
    """
    Fetch live Fear & Greed data and classify current crypto regime.

    Returns dict with:
      - regime: str (EXTREME_FEAR, BEARISH, NEUTRAL, BULLISH, EXTREME_GREED)
      - fgi_value: int (0-100)
      - fgi_label: str (e.g. "Fear", "Greed")
      - btc_dominance: float | None
      - active_variants: list[str]
    """
    try:
        fgi = fetch_fear_and_greed()
        fgi_value = fgi["value"]
        fgi_label = fgi["label"]
        fgi_timestamp = fgi["timestamp"]
    except Exception as e:
        logger.error("Failed to fetch Fear & Greed Index: %s -- defaulting to NEUTRAL", e)
        fgi_value = 50
        fgi_label = "Neutral (default)"
        fgi_timestamp = datetime.now(timezone.utc).isoformat()

    btc_dominance = fetch_btc_dominance()

    regime = classify_regime(fgi_value)
    active = get_active_variants(regime)

    logger.info(
        "Regime: %s | FGI: %d (%s) | BTC dominance: %s%% | Active variants: %s",
        regime, fgi_value, fgi_label,
        f"{btc_dominance:.1f}" if btc_dominance else "N/A",
        ", ".join(active),
    )

    # Log to database
    try:
        _log_regime(regime, fgi_value, fgi_label, btc_dominance)
    except Exception as e:
        logger.warning("Failed to log regime to DB: %s", e)

    return {
        "regime": regime,
        "fgi_value": fgi_value,
        "fgi_label": fgi_label,
        "fgi_timestamp": fgi_timestamp,
        "btc_dominance": btc_dominance,
        "active_variants": active,
    }


def _log_regime(regime: str, fgi_value: int, fgi_label: str, btc_dominance: float | None):
    """Log regime classification to crypto_regime_log table."""
    from database.db import get_db
    db = get_db()
    db.execute_insert(
        """INSERT INTO crypto_regime_log
           (timestamp_utc, fgi_value, fgi_label, regime, btc_dominance_pct)
           VALUES (?, ?, ?, ?, ?)""",
        (
            datetime.now(timezone.utc).isoformat(),
            fgi_value,
            fgi_label,
            regime,
            btc_dominance,
        ),
    )
