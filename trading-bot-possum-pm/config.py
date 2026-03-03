"""
Possum PM — Configuration System
Single source of truth for all tuneable parameters.
Uses Pydantic BaseSettings for validation and .env loading.

Architecture: Velocity scan → Manifold/Polymarket gap → Alert gate → Grok evaluation → Paper trade.
"""

import json
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env file from project root
load_dotenv(Path(__file__).parent / ".env")

PROJECT_DIR = Path(__file__).parent
DAILY_RESULTS_DIR = PROJECT_DIR / "results"
CONTRACTS_PATH = PROJECT_DIR / "contracts.json"


class LLMSettings(BaseSettings):
    xai_api_key: str = ""
    grok_model: str = "grok-4-1-fast-non-reasoning"
    grok_api_base: str = "https://api.x.ai/v1"
    grok_max_tokens: int = 2000
    grok_temperature: float = 0.3


class PMSettings(BaseSettings):
    """Prediction market pipeline thresholds."""
    velocity_threshold: float = 3.0       # Article velocity ratio to trigger alert
    manifold_gap_threshold: float = 15.0  # |manifold - polymarket| in percentage points
    max_contracts: int = 20               # Max active contracts to scan per run

    # Competition / P&L tracking
    competition_capital_aud: float = 15000.0  # A$15k starting capital
    max_open_positions: int = 5               # Max concurrent PM positions
    position_size_usd: float = 1900.0         # ~A$15k / 1.58 / 5 positions


class GDELTSettings(BaseSettings):
    """GDELT data pipeline settings (Phase 2)."""
    lookback_hours: int = 6              # Hours of GKG files to download per run
    download_timeout: int = 45           # Seconds per file download
    min_baseline_days: int = 3           # Min days before computing real velocity
    default_velocity: float = 1.0        # Velocity when insufficient baseline data
    max_files_per_run: int = 48          # Safety cap on files per run


class CostSettings(BaseSettings):
    max_daily_llm_spend_usd: float = 5.0


class PossumPMConfig(BaseSettings):
    """Master configuration composing all sub-configs."""

    llm: LLMSettings = Field(default_factory=LLMSettings)
    pm: PMSettings = Field(default_factory=PMSettings)
    gdelt: GDELTSettings = Field(default_factory=GDELTSettings)
    cost: CostSettings = Field(default_factory=CostSettings)

    db_path: Path = PROJECT_DIR / "possum_pm.db"
    log_level: str = "INFO"

    @property
    def contracts(self) -> list[dict]:
        """Load active contracts from contracts.json."""
        if CONTRACTS_PATH.exists():
            with open(CONTRACTS_PATH) as f:
                all_contracts = json.load(f)
            return [c for c in all_contracts if c.get("active", True)]
        return []


# Module-level singleton
_config: PossumPMConfig | None = None


def get_config() -> PossumPMConfig:
    global _config
    if _config is None:
        _config = PossumPMConfig()
    return _config
