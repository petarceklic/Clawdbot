"""
Possum PM — Polymarket Client
Fetches YES contract prices from Polymarket Gamma API.
Falls back to cached prices if API is unreachable.

Polymarket contracts are priced $0.00 - $1.00 (YES token).
Price of $0.28 means the market implies 28% probability.

Note: ISP DNS in Australia blocks gamma-api.polymarket.com.
We resolve via Google DNS (8.8.8.8) as a workaround.
"""

import logging
import socket
import ssl
import json
from http.client import HTTPSConnection

logger = logging.getLogger("possum.pm.polymarket")

GAMMA_HOST = "gamma-api.polymarket.com"

# Cached prices — updated when API is reachable, used as fallback when not.
# Last updated: 2026-03-02 from live Gamma API.
_cached_prices: dict[str, float] = {
    "iran-strike-2026": 1.00,           # Resolved YES ~Feb 28
    "ukraine-ceasefire-2026": 0.375,    # ~37.5% (ceasefire by end 2026)
    "greenland-acquisition-2026": 0.155, # ~15.5% (acquisition in 2026)
}


def _resolve_host() -> str:
    """Resolve gamma-api.polymarket.com, falling back to Google DNS if ISP blocks it."""
    try:
        return socket.gethostbyname(GAMMA_HOST)
    except socket.gaierror:
        pass

    # ISP DNS blocked — resolve via Google DNS (8.8.8.8)
    try:
        import subprocess
        result = subprocess.run(
            ["dig", "+short", GAMMA_HOST, "@8.8.8.8"],
            capture_output=True, text=True, timeout=5,
        )
        ips = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
        if ips:
            logger.info("Resolved %s via Google DNS → %s", GAMMA_HOST, ips[0])
            return ips[0]
    except Exception:
        pass

    return ""


class PolymarketClient:
    """Fetch YES contract prices from Polymarket Gamma API with cached fallback."""

    def __init__(self):
        self._session_cache: dict[str, float] = {}
        self._resolved_ip: str | None = None

    def get_yes_price(self, contract: dict) -> float | None:
        """
        Return the YES token price for a contract.
        Tries Gamma API first, falls back to cached price.

        Returns:
            Price as float (0.0-1.0) or None if unavailable.
        """
        contract_id = contract["id"]
        slug = contract.get("polymarket_slug", "")

        # Try session cache first (avoid repeated API calls in same pipeline run)
        if contract_id in self._session_cache:
            price = self._session_cache[contract_id]
            logger.info("Polymarket: %s → $%.4f (session cache)", contract_id, price)
            return price

        # Try Gamma API
        if slug:
            price = self._fetch_from_gamma(slug)
            if price is not None:
                self._session_cache[contract_id] = price
                _cached_prices[contract_id] = price
                logger.info("Polymarket: %s → $%.4f (live)", contract_id, price)
                return price

        # Fall back to cached price
        price = _cached_prices.get(contract_id)
        if price is not None:
            self._session_cache[contract_id] = price
            logger.info("Polymarket: %s → $%.4f (cached fallback)", contract_id, price)
        else:
            logger.warning("No Polymarket price for %s", contract_id)

        return price

    def _get_ip(self) -> str:
        """Get resolved IP for Gamma API, caching for session."""
        if self._resolved_ip is None:
            self._resolved_ip = _resolve_host()
        return self._resolved_ip

    def _gamma_get(self, path: str) -> list | dict | None:
        """Make an HTTPS GET to Gamma API, handling DNS issues."""
        ip = self._get_ip()
        if not ip:
            return None

        try:
            ctx = ssl.create_default_context()
            conn = HTTPSConnection(ip, 443, timeout=5, context=ctx)
            conn.set_tunnel(GAMMA_HOST) if ip != GAMMA_HOST else None
            # SNI: set the correct hostname for TLS
            conn.request("GET", path, headers={
                "Host": GAMMA_HOST,
                "Accept": "application/json",
            })
            resp = conn.getresponse()
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode())
        except Exception as e:
            logger.debug("Gamma API request failed: %s", e)
            return None

    def _fetch_from_gamma(self, slug: str) -> float | None:
        """Fetch YES price from Polymarket Gamma API by slug.
        Tries /markets first (single market), then /events (multi-market events)."""

        # Try direct market lookup
        data = self._gamma_get(f"/markets?slug={slug}")
        if isinstance(data, list) and len(data) > 0:
            price = self._extract_yes_price(data[0])
            if price is not None:
                return price

        # Try events endpoint (some contracts are events with sub-markets)
        data = self._gamma_get(f"/events?slug={slug}")
        if isinstance(data, list) and len(data) > 0:
            event = data[0]
            markets = event.get("markets", [])
            if len(markets) == 1:
                price = self._extract_yes_price(markets[0])
                if price is not None:
                    return price
            # Multi-market event: look for the broadest resolution date
            for m in markets:
                price = self._extract_yes_price(m)
                if price is not None:
                    return price

        return None

    @staticmethod
    def _extract_yes_price(market: dict) -> float | None:
        """Extract YES price from a market dict."""
        # outcomePrices is ["yes_price", "no_price"]
        outcome_prices = market.get("outcomePrices")
        if outcome_prices:
            if isinstance(outcome_prices, str):
                prices = json.loads(outcome_prices)
            else:
                prices = outcome_prices
            if prices and len(prices) > 0:
                return float(prices[0])

        ltp = market.get("lastTradePrice")
        if ltp is not None:
            return float(ltp)

        return None
