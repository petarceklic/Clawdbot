"""
Possum PM — Manifold Markets Checker
Fetches forecaster consensus probabilities from Manifold Markets API.
Real API call with stub fallback on error.

Manifold Markets has a fully open REST API — no auth required.
"""

import logging

import requests

from utils.retry import retry_data_fetch

logger = logging.getLogger("possum.pm.manifold")

MANIFOLD_API_BASE = "https://api.manifold.markets/v0"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}
TIMEOUT = 15

# Stub probabilities for fallback
STUB_PROBABILITIES: dict[str, float] = {
    "iran-strike-2026": 0.22,
    "ukraine-ceasefire-2026": 0.35,
    "greenland-acquisition-2026": 0.05,
}


class ManifoldChecker:
    """Fetch forecaster consensus from Manifold Markets."""

    @retry_data_fetch
    def get_probability(self, contract: dict) -> tuple[float | None, dict]:
        """
        Search Manifold Markets for a matching market and return probability.

        Returns:
            (probability, metadata) where probability is 0.0-1.0 or None,
            and metadata contains market details.
        """
        search_term = contract.get("manifold_search_term", contract["name"])
        contract_id = contract["id"]

        try:
            url = f"{MANIFOLD_API_BASE}/search-markets"
            params = {
                "term": search_term,
                "filter": "open",
                "sort": "liquidity",
                "limit": 5,
            }
            resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            markets = resp.json()

            if not markets:
                logger.warning("No Manifold markets found for '%s'", search_term)
                return self._stub_fallback(contract_id, "no_results")

            # Take the most liquid matching market
            best = markets[0]
            prob = best.get("probability")

            metadata = {
                "platform": "Manifold Markets",
                "source": "live_api",
                "title": best.get("question"),
                "url": best.get("url"),
                "probability": round(prob, 4) if prob is not None else None,
                "traders": best.get("uniqueBettorCount"),
                "total_liquidity": best.get("totalLiquidity"),
                "markets_found": len(markets),
            }

            logger.info(
                "Manifold: %s → %.1f%% (%d traders, $%.0f liquidity)",
                contract_id,
                (prob or 0) * 100,
                metadata["traders"] or 0,
                metadata["total_liquidity"] or 0,
            )

            return prob, metadata

        except Exception as e:
            logger.warning("Manifold API failed for %s: %s — using stub", contract_id, e)
            return self._stub_fallback(contract_id, str(e))

    def _stub_fallback(self, contract_id: str, reason: str) -> tuple[float | None, dict]:
        """Return stub probability when API fails."""
        prob = STUB_PROBABILITIES.get(contract_id)
        return prob, {
            "platform": "Manifold Markets",
            "source": "stub_fallback",
            "reason": reason,
            "probability": prob,
        }
