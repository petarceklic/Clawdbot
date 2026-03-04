"""
Possum PM — Grok Agent for Prediction Markets
Single Grok API call per contract via xAI (OpenAI-compatible endpoint).
Returns structured JSON with direction, confidence, action recommendation.

Grok has real-time X/Twitter access — the PM prompt instructs it to search
for latest geopolitical intel before making a recommendation.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone

import openai

from agent.prompts.pm_prompt import PM_SYSTEM_PROMPT, PM_USER_PROMPT
from database.db import get_db
from utils.retry import retry_llm_call

logger = logging.getLogger("possum.pm.agent.grok")

# Approximate pricing per million tokens (input, output) in USD
COST_TABLE = {
    "grok-3-fast": (5.00, 25.00),
    "grok-3": (10.00, 50.00),
    "grok-4-1-fast-non-reasoning": (2.00, 10.00),
}


class PMGrokAgent:
    """Grok API call for prediction market contract evaluation."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()
        self.model = self.cfg.llm.grok_model
        self._client = openai.OpenAI(
            api_key=self.cfg.llm.xai_api_key,
            base_url=self.cfg.llm.grok_api_base,
        )

    def evaluate_contract(
        self,
        contract: dict,
        velocity_ratio: float,
        headlines: list[str],
        manifold_probability: float | None,
        polymarket_price: float | None,
    ) -> dict | None:
        """
        Evaluate a single contract via Grok.

        Returns parsed Grok response dict or None on failure.
        """
        messages = self._build_messages(
            contract, velocity_ratio, headlines,
            manifold_probability, polymarket_price,
        )
        start = time.time()

        try:
            raw_text, input_tokens, output_tokens = self._call(messages)
            latency_ms = int((time.time() - start) * 1000)
            parsed = self._parse_response(raw_text)

            if parsed is None:
                logger.warning("Failed to parse Grok response for %s", contract["id"])
                return None

            cost = self._estimate_cost(input_tokens, output_tokens)
            self._log_cost(input_tokens, output_tokens, cost)

            logger.info(
                "Grok: %s → %s (confidence: %.2f, action: %s) in %dms ($%.4f)",
                contract["id"],
                parsed.get("direction", "?"),
                parsed.get("confidence", 0),
                parsed.get("action", "?"),
                latency_ms,
                cost,
            )

            parsed["_meta"] = {
                "model": self.model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "cost_usd": cost,
            }

            return parsed

        except Exception as e:
            logger.error("Grok evaluation failed for %s: %s", contract["id"], e)
            return None

    def _build_messages(
        self,
        contract: dict,
        velocity_ratio: float,
        headlines: list[str],
        manifold_probability: float | None,
        polymarket_price: float | None,
    ) -> list[dict]:
        """Build the prompt messages for Grok."""
        from config import get_config
        cfg = get_config()

        pm_price = polymarket_price or 0.0
        mf_prob = manifold_probability or 0.0
        gap_pp = abs(mf_prob - pm_price) * 100

        headlines_text = "\n".join(f"  - {h}" for h in headlines) if headlines else "  No headlines available"

        user_prompt = PM_USER_PROMPT.format(
            contract_name=contract["name"],
            contract_id=contract["id"],
            contract_type=contract.get("contract_type", "unknown"),
            resolution_date=contract.get("resolution_date", "unknown"),
            keywords=", ".join(contract.get("keywords", [])),
            polymarket_price=pm_price,
            polymarket_pct=pm_price * 100,
            manifold_pct=mf_prob * 100,
            gap_pp=gap_pp,
            velocity_ratio=velocity_ratio,
            velocity_threshold=cfg.pm.velocity_threshold,
            velocity_triggered="YES" if velocity_ratio >= cfg.pm.velocity_threshold else "NO",
            headlines=headlines_text,
        )

        return [
            {"role": "system", "content": PM_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

    @retry_llm_call
    def _call(self, messages: list[dict]) -> tuple[str, int, int]:
        """Make the Grok API call."""
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
        """Parse JSON from Grok response. Three-tier parsing."""
        # Tier 1: Direct parse
        try:
            return json.loads(raw_text.strip())
        except json.JSONDecodeError:
            pass

        # Tier 2: Extract from markdown code block
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Tier 3: First JSON object in text
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        logger.warning("Could not parse JSON from Grok: %s...", raw_text[:200])
        return None

    def scan_breaking_news(self, contracts: list[dict]) -> list[dict]:
        """
        Ask Grok to identify breaking news that could reprice any active contract.
        Returns list of contracts flagged as needing urgent re-evaluation.

        This is a single, cheap API call that screens ALL contracts at once.
        """
        if not contracts:
            return []

        contract_summaries = []
        for c in contracts:
            contract_summaries.append(
                f"- {c['id']}: {c['name']} (type: {c.get('contract_type', 'unknown')}, "
                f"resolves: {c.get('resolution_date', '?')})"
            )

        prompt = (
            "You are monitoring prediction markets for breaking news. "
            "Search X/Twitter for the latest posts and news from the last 2 hours.\n\n"
            "Active contracts being tracked:\n"
            + "\n".join(contract_summaries) + "\n\n"
            "For each contract, determine if there is BREAKING NEWS in the last 2 hours "
            "that would significantly move the probability (>5pp shift).\n\n"
            "Return JSON:\n"
            '{"alerts": [{"contract_id": "...", "headline": "...", "impact": "...", '
            '"estimated_shift_pp": <number>, "urgency": "high"|"medium"|"low"}], '
            '"no_alerts_reason": "..." }\n\n'
            "If no breaking news affects any contract, return empty alerts array."
        )

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a real-time news monitor for prediction markets. Search X/Twitter NOW for breaking stories."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=1500,
            )

            text = response.choices[0].message.content
            cost = self._estimate_cost(
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
            )
            self._log_cost(
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                cost,
            )

            parsed = self._parse_response(text)
            if parsed and parsed.get("alerts"):
                alerts = parsed["alerts"]
                flagged = []
                for alert in alerts:
                    cid = alert.get("contract_id", "")
                    shift = abs(alert.get("estimated_shift_pp", 0))
                    urgency = alert.get("urgency", "low")
                    if shift >= 5 or urgency == "high":
                        flagged.append(alert)
                        logger.info(
                            "BREAKING NEWS for %s: %s (shift: %+.0fpp, urgency: %s)",
                            cid, alert.get("headline", "?"), shift, urgency,
                        )
                return flagged
            else:
                reason = parsed.get("no_alerts_reason", "no breaking news") if parsed else "parse failed"
                logger.info("News scan: no alerts (%s)", reason)
                return []

        except Exception as e:
            logger.error("Breaking news scan failed: %s", e)
            return []

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
_agent: PMGrokAgent | None = None


def get_pm_grok_agent() -> PMGrokAgent:
    global _agent
    if _agent is None:
        _agent = PMGrokAgent()
    return _agent
