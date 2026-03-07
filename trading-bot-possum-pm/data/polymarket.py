"""
Possum PM — Polymarket Client
Fetches YES contract prices from Polymarket Gamma API.

Price-fetching chain (3 tiers):
  1. Gamma API (gamma-api.polymarket.com) — primary, official API
  2. Scraper fallback (CLOB/Strapi endpoints) — alternative when Gamma is down
  3. Cached prices (in-memory + disk) — last resort

Polymarket contracts are priced $0.00 - $1.00 (YES token).
Price of $0.28 means the market implies 28% probability.

Note: ISP DNS in Australia blocks *.polymarket.com domains.
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
# Last updated: 2026-03-07 from live Gamma API.
_cached_prices: dict[str, float] = {
    "iran-strike-2026": 1.00,              # Resolved YES ~Feb 28
    "ukraine-ceasefire-2026": 0.385,       # ~38.5% (ceasefire by end 2026)
    "greenland-acquisition-2026": 0.165,   # ~16.5% (acquisition in 2026)
    "china-taiwan-blockade-2026": 0.109,   # ~10.9% (invasion by end 2026)
    "us-recession-2026": 0.335,            # ~33.5% (recession by end 2026)
    "bitcoin-above-150k-2026": 0.125,      # ~12.5% (BTC $150k by end 2026)
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
    """Fetch YES contract prices from Polymarket Gamma API with scraper + cached fallback."""

    def __init__(self):
        self._session_cache: dict[str, float] = {}
        self._resolved_ip: str | None = None
        self._scraper = None  # lazy init

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

        # Tier 1: Gamma API (primary)
        if slug:
            price = self._fetch_from_gamma(slug)
            if price is not None:
                self._session_cache[contract_id] = price
                _cached_prices[contract_id] = price
                # Persist to disk cache for resilience
                try:
                    from data.polymarket_scraper import persist_price
                    persist_price(contract_id, price)
                except Exception:
                    pass
                logger.info("Polymarket: %s → $%.4f (live)", contract_id, price)
                return price

        # Tier 2: Scraper fallback (CLOB/Strapi endpoints)
        try:
            if self._scraper is None:
                from data.polymarket_scraper import PolymarketScraper
                self._scraper = PolymarketScraper()
            price = self._scraper.get_yes_price(contract)
            if price is not None:
                self._session_cache[contract_id] = price
                _cached_prices[contract_id] = price
                logger.info("Polymarket: %s → $%.4f (scraper fallback)", contract_id, price)
                return price
        except Exception as e:
            logger.debug("Scraper fallback failed for %s: %s", contract_id, e)

        # Tier 3: In-memory cached price (hardcoded fallback)
        price = _cached_prices.get(contract_id)
        if price is not None:
            self._session_cache[contract_id] = price
            logger.info("Polymarket: %s → $%.4f (cached fallback)", contract_id, price)
        else:
            logger.warning("No Polymarket price for %s (all tiers failed)", contract_id)

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
            # Connect raw TCP socket to the resolved IP, then wrap with TLS.
            # server_hostname= tells the TLS layer to send the real hostname
            # in the SNI extension (required when connecting via IP address).
            raw = socket.create_connection((ip, 443), timeout=5)
            ctx = ssl.create_default_context()
            ssock = ctx.wrap_socket(raw, server_hostname=GAMMA_HOST)

            conn = HTTPSConnection(GAMMA_HOST, 443, timeout=5, context=ctx)
            conn.sock = ssock
            conn.request("GET", path, headers={
                "Host": GAMMA_HOST,
                "Accept": "application/json",
            })
            resp = conn.getresponse()
            if resp.status != 200:
                logger.warning("Gamma API %s returned %d", path, resp.status)
                return None
            return json.loads(resp.read().decode())
        except Exception as e:
            logger.warning("Gamma API request failed: %s", e)
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
