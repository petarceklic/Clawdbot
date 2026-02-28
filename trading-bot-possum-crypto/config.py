"""
Possum Crypto -- Configuration System
Single source of truth for all tuneable parameters.
Uses Pydantic BaseSettings for validation and .env loading.

Architecture: Regime filter -> Grok call per asset -> 9 local variants -> Execute -> Log.
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent / ".env")

PROJECT_DIR = Path(__file__).parent
RESULTS_DIR = PROJECT_DIR / "results"


class KrakenSettings(BaseSettings):
    """Kraken exchange API credentials."""
    key: str = ""
    secret: str = ""

    model_config = {"env_prefix": "POSSUM_KRAKEN_"}


class LLMSettings(BaseSettings):
    """Grok API settings (shared key with Possum US/AU)."""
    xai_api_key: str = ""
    grok_model: str = "grok-4-1-fast-non-reasoning"
    grok_api_base: str = "https://api.x.ai/v1"
    grok_max_tokens: int = 2000
    grok_temperature: float = 0.3


class TradingSettings(BaseSettings):
    """Asset universe and position sizing."""
    universe: list[str] = ["BTC/AUD", "ETH/AUD", "SOL/AUD"]

    # Risk management
    max_position_size_aud: float = 100.0    # Max per trade during paper phase
    max_positions: int = 3                   # One per asset max
    stop_loss_pct: float = 0.05              # 5% hard stop
    take_profit_pct: float = 0.10            # 10% default take profit

    # Execution
    dry_run: bool = True                     # Paper trading by default

    # Fees (Kraken base tier)
    maker_fee_pct: float = 0.0025            # 0.25%
    taker_fee_pct: float = 0.0040            # 0.40%


class RegimeSettings(BaseSettings):
    """Crypto regime filter thresholds."""
    fgi_extreme_fear: int = 20               # Below = EXTREME_FEAR
    fgi_bearish: int = 40                    # Below = BEARISH
    fgi_bullish: int = 60                    # Above = BULLISH
    fgi_extreme_greed: int = 80              # Above = EXTREME_GREED


class VariantSettings(BaseSettings):
    """Per-variant parameters."""
    # Confidence thresholds
    momentum_min_confidence: float = 0.6     # M1, M2, M3
    sentiment_min_confidence: float = 0.7    # S1
    s2_min_confidence: float = 0.65          # S2 (Grok + tech confirm)
    s3_confidence_range: tuple = (0.4, 0.6)  # S3 contrarian zone

    # Technical thresholds
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0
    rsi_momentum_line: float = 50.0
    volume_breakout_ratio: float = 1.5       # M3 volume confirmation
    breakout_lookback_days: int = 7          # M3 7-day high


class CostSettings(BaseSettings):
    """API cost tracking."""
    max_daily_llm_spend_usd: float = 5.0


# Regime-variant matrix: which variants can trade in each regime
REGIME_VARIANT_MATRIX: dict[str, list[str]] = {
    "EXTREME_FEAR":  ["MR1", "MR2", "MR3"],
    "BEARISH":       ["MR1", "MR2", "MR3", "S1", "S2"],
    "NEUTRAL":       ["M1", "M2", "M3", "MR1", "MR2", "MR3", "S1", "S2", "S3"],
    "BULLISH":       ["M1", "M2", "M3", "S1", "S2", "S3"],
    "EXTREME_GREED": ["MR1", "MR2", "MR3"],
}


class CryptoConfig(BaseSettings):
    """Master configuration composing all sub-configs."""

    kraken: KrakenSettings = Field(default_factory=KrakenSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    trading: TradingSettings = Field(default_factory=TradingSettings)
    regime: RegimeSettings = Field(default_factory=RegimeSettings)
    variants: VariantSettings = Field(default_factory=VariantSettings)
    cost: CostSettings = Field(default_factory=CostSettings)

    db_path: Path = PROJECT_DIR / "possum_crypto.db"
    log_level: str = "INFO"


# Module-level singleton
_config: CryptoConfig | None = None


def get_config() -> CryptoConfig:
    global _config
    if _config is None:
        _config = CryptoConfig()
    return _config
