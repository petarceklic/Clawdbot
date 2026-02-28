"""
Possum Crypto -- Grok Agent
Single comprehensive API call per asset via xAI (OpenAI-compatible endpoint).
Returns structured JSON: direction, confidence, sentiment, technicals.

Same pattern as Possum US/AU but with crypto-specific prompts and no async
(only 3 assets, sequential is fine).
"""

import json
import logging
import re
import time
from datetime import datetime, timezone

import openai

from agent.prompts.crypto_prompt import CRYPTO_SYSTEM_PROMPT, CRYPTO_USER_PROMPT
from database.db import get_db
from utils.retry import retry_llm_call

logger = logging.getLogger("possum.crypto.grok")

# Approximate pricing per million tokens (input, output) in USD
COST_TABLE = {
    "grok-3-fast": (5.00, 25.00),
    "grok-3": (10.00, 50.00),
    "grok-4-1-fast-non-reasoning": (2.00, 10.00),
}


class CryptoGrokAgent:
    """Single Grok API call for comprehensive crypto asset analysis."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()
        self.model = self.cfg.llm.grok_model
        self._client = openai.OpenAI(
            api_key=self.cfg.llm.xai_api_key,
            base_url=self.cfg.llm.grok_api_base,
        )

    def analyze(self, symbol: str, indicators: dict, regime_data: dict) -> dict | None:
        """
        Synchronous analysis of a crypto asset.
        Returns parsed Grok response dict or None on failure.
        """
        messages = self._build_messages(symbol, indicators, regime_data)
        start = time.time()

        try:
            raw_text, input_tokens, output_tokens = self._call(messages)
            latency_ms = int((time.time() - start) * 1000)
            parsed = self._parse_response(raw_text)

            if parsed is None:
                logger.warning("Failed to parse Grok response for %s", symbol)
                return None

            cost = self._estimate_cost(input_tokens, output_tokens)
            self._log_cost(input_tokens, output_tokens, cost)

            logger.info(
                "Grok: %s -> %s (confidence: %.2f) in %dms ($%.4f)",
                symbol, parsed.get("overall_signal", "?"),
                parsed.get("confidence", 0), latency_ms, cost,
            )

            # Attach meta
            parsed["_meta"] = {
                "model": self.model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "cost_usd": cost,
            }

            return parsed

        except Exception as e:
            logger.error("Grok analysis failed for %s: %s", symbol, e)
            return None

    def _build_messages(self, symbol: str, indicators: dict, regime_data: dict) -> list[dict]:
        """Build prompt messages for Grok."""
        user_prompt = CRYPTO_USER_PROMPT.format(
            symbol=symbol,
            current_price=indicators.get("current_price", 0),
            prev_close=indicators.get("prev_close", 0),
            change_24h_pct=indicators.get("change_24h_pct", 0),
            rsi=indicators.get("rsi", "N/A"),
            ema_25=indicators.get("ema_25", "N/A"),
            ema_50=indicators.get("ema_50", "N/A"),
            ema_signal=indicators.get("ema_signal", "N/A"),
            ema_crossover=indicators.get("ema_crossover", "None"),
            macd_line=indicators.get("macd_line", "N/A"),
            macd_signal_line=indicators.get("macd_signal_line", "N/A"),
            macd_histogram=indicators.get("macd_histogram", "N/A"),
            macd_signal=indicators.get("macd_signal", "N/A"),
            bb_upper=indicators.get("bb_upper", "N/A"),
            bb_middle=indicators.get("bb_middle", "N/A"),
            bb_lower=indicators.get("bb_lower", "N/A"),
            bb_position=indicators.get("bb_position", "N/A"),
            adx=indicators.get("adx", "N/A"),
            volume_ratio=indicators.get("volume_ratio", "N/A"),
            high_7d=indicators.get("high_7d", "N/A"),
            low_7d=indicators.get("low_7d", "N/A"),
            fgi_value=regime_data.get("fgi_value", "N/A"),
            fgi_label=regime_data.get("fgi_label", "N/A"),
            regime=regime_data.get("regime", "NEUTRAL"),
            btc_dominance=regime_data.get("btc_dominance", "N/A"),
        )

        return [
            {"role": "system", "content": CRYPTO_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

    @retry_llm_call
    def _call(self, messages: list[dict]) -> tuple[str, int, int]:
        """Call Grok API and return (text, input_tokens, output_tokens)."""
        response = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=self.cfg.llm.grok_temperature,
            max_tokens=self.cfg.llm.grok_max_tokens,
        )
        text = response.choices[0].message.content
        return text, response.usage.prompt_tokens, response.usage.completion_tokens

    def _parse_response(self, raw_text: str) -> dict | None:
        """Parse JSON from Grok response."""
        # Direct parse
        try:
            return json.loads(raw_text.strip())
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try first JSON object
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        logger.warning("Could not parse JSON from Grok: %s...", raw_text[:200])
        return None

    def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        rates = COST_TABLE.get(self.model, (5.0, 25.0))
        cost = (input_tokens * rates[0] / 1_000_000) + (output_tokens * rates[1] / 1_000_000)
        return round(cost, 6)

    def _log_cost(self, input_tokens: int, output_tokens: int, cost: float):
        try:
            db = get_db()
            db.execute_insert(
                "INSERT INTO api_costs (timestamp_utc, provider, model, input_tokens, output_tokens, estimated_cost_usd) VALUES (?, ?, ?, ?, ?, ?)",
                (datetime.now(timezone.utc).isoformat(), "xai", self.model, input_tokens, output_tokens, cost),
            )
        except Exception as e:
            logger.warning("Failed to log API cost: %s", e)


# Singleton
_agent: CryptoGrokAgent | None = None


def get_grok_agent() -> CryptoGrokAgent:
    global _agent
    if _agent is None:
        _agent = CryptoGrokAgent()
    return _agent
