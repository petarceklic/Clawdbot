"""
Possum PM — Polymarket Scraper / Alternative Price Fetcher
Middle fallback layer in the price-fetching chain:

  Gamma API  →  Scraper (this module)  →  Disk cache

Three strategies (tried in order):
  1. CLOB API (clob.polymarket.com) — different endpoint, might be up when Gamma isn't
  2. Strapi API (strapi-matic.polymarket.com) — content/market API
  3. Disk cache (data/polymarket_cache.json) — persisted from any successful fetch

All strategies use the same Google DNS (8.8.8.8) workaround for Australian
ISP blocking of *.polymarket.com domains.

Note: Scrapling was considered for HTML scraping of polymarket.com, but
since the site is Cloudflare-protected AND DNS-blocked by Australian ISPs,
a headless browser would face the same resolution issues. The CLOB/Strapi
API fallbacks provide better reliability without heavy browser dependencies.
"""

import json
import logging
import os
import socket
import ssl
import time
from http.client import HTTPSConnection
from pathlib import Path

logger = logging.getLogger("possum.pm.scraper")

CLOB_HOST = "clob.polymarket.com"
STRAPI_HOST = "strapi-matic.polymarket.com"

# Disk cache location (alongside this module)
CACHE_FILE = Path(__file__).parent / "polymarket_cache.json"
CACHE_TTL = 7200  # 2 hours — scraper cache is fresher than hardcoded fallback


def _resolve_host(hostname: str) -> str:
    """Resolve hostname, falling back to Google DNS if ISP blocks it."""
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        pass

    # ISP DNS blocked — resolve via Google DNS
    try:
        import subprocess
        result = subprocess.run(
            ["dig", "+short", hostname, "@8.8.8.8"],
            capture_output=True, text=True, timeout=5,
        )
        ips = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
        if ips:
            # Filter out CNAME records (non-IP results)
            for ip in ips:
                if ip[0].isdigit():
                    logger.info("Resolved %s via Google DNS → %s", hostname, ip)
                    return ip
    except Exception:
        pass

    return ""


def _https_get(hostname: str, path: str, timeout: int = 8) -> dict | list | None:
    """Make HTTPS GET request with DNS workaround."""
    ip = _resolve_host(hostname)
    if not ip:
        logger.debug("Cannot resolve %s", hostname)
        return None

    try:
        # Connect raw TCP socket to the resolved IP, then wrap with TLS.
        # server_hostname= tells the TLS layer to send the real hostname
        # in the SNI extension (required when connecting via IP address).
        raw = socket.create_connection((ip, 443), timeout=timeout)
        ctx = ssl.create_default_context()
        ssock = ctx.wrap_socket(raw, server_hostname=hostname)

        conn = HTTPSConnection(hostname, 443, timeout=timeout, context=ctx)
        conn.sock = ssock
        conn.request("GET", path, headers={
            "Host": hostname,
            "Accept": "application/json",
            "User-Agent": "PossumTrader/1.0",
        })
        resp = conn.getresponse()
        if resp.status != 200:
            logger.warning("%s%s returned %d", hostname, path, resp.status)
            return None
        return json.loads(resp.read().decode())
    except Exception as e:
        logger.warning("%s request failed: %s", hostname, e)
        return None


class PolymarketScraper:
    """Alternative Polymarket price fetcher — middle fallback layer."""

    def __init__(self):
        self._resolved_hosts: dict[str, str] = {}

    def get_yes_price(self, contract: dict) -> float | None:
        """
        Try to get YES price through alternative endpoints.
        Returns price (0.0-1.0) or None if all strategies fail.
        """
        slug = contract.get("polymarket_slug", "")
        contract_id = contract["id"]

        if not slug:
            return self._get_disk_cache(contract_id)

        # Strategy 1: Strapi/content API
        price = self._try_strapi(slug)
        if price is not None:
            self._save_disk_cache(contract_id, price)
            logger.info("Scraper: %s → $%.4f (strapi)", contract_id, price)
            return price

        # Strategy 2: CLOB book endpoint
        price = self._try_clob(slug)
        if price is not None:
            self._save_disk_cache(contract_id, price)
            logger.info("Scraper: %s → $%.4f (clob)", contract_id, price)
            return price

        # Strategy 3: Disk cache
        price = self._get_disk_cache(contract_id)
        if price is not None:
            logger.info("Scraper: %s → $%.4f (disk cache)", contract_id, price)
        else:
            logger.warning("Scraper: no price for %s (all strategies failed)", contract_id)

        return price

    def _try_strapi(self, slug: str) -> float | None:
        """Try Strapi content API for market data."""
        # Strapi API returns market metadata including prices
        data = _https_get(STRAPI_HOST, f"/markets?slug={slug}")
        if isinstance(data, list) and data:
            market = data[0]
            return self._extract_price(market)
        if isinstance(data, dict):
            return self._extract_price(data)
        return None

    def _try_clob(self, slug: str) -> float | None:
        """Try CLOB API for order book midpoint."""
        # CLOB markets endpoint — public, no auth needed for reading
        data = _https_get(CLOB_HOST, f"/markets?slug={slug}")
        if isinstance(data, list) and data:
            market = data[0]
            return self._extract_price(market)
        if isinstance(data, dict):
            return self._extract_price(data)
        return None

    @staticmethod
    def _extract_price(market: dict) -> float | None:
        """Extract YES price from a market data dict."""
        # outcomePrices format: ["0.37", "0.63"] (YES, NO)
        outcome_prices = market.get("outcomePrices")
        if outcome_prices:
            if isinstance(outcome_prices, str):
                prices = json.loads(outcome_prices)
            else:
                prices = outcome_prices
            if prices and len(prices) > 0:
                try:
                    return float(prices[0])
                except (ValueError, TypeError):
                    pass

        # lastTradePrice fallback
        ltp = market.get("lastTradePrice")
        if ltp is not None:
            try:
                return float(ltp)
            except (ValueError, TypeError):
                pass

        # bestBid as last resort (order book)
        bid = market.get("bestBid")
        if bid is not None:
            try:
                return float(bid)
            except (ValueError, TypeError):
                pass

        return None

    # --- Disk cache for resilience ---

    def _get_disk_cache(self, contract_id: str) -> float | None:
        """Read price from disk cache if fresh enough."""
        try:
            if not CACHE_FILE.exists():
                return None
            with open(CACHE_FILE) as f:
                cache = json.load(f)
            entry = cache.get(contract_id)
            if entry is None:
                return None
            # Check TTL
            if time.time() - entry.get("ts", 0) > CACHE_TTL:
                logger.debug("Disk cache expired for %s", contract_id)
                return None
            return entry.get("price")
        except Exception:
            return None

    def _save_disk_cache(self, contract_id: str, price: float):
        """Persist price to disk cache."""
        try:
            cache = {}
            if CACHE_FILE.exists():
                with open(CACHE_FILE) as f:
                    cache = json.load(f)

            cache[contract_id] = {"price": price, "ts": time.time()}

            with open(CACHE_FILE, "w") as f:
                json.dump(cache, f, indent=2)
        except Exception as e:
            logger.debug("Failed to write disk cache: %s", e)


# Also: save prices to disk from the main Gamma API client
# Call this whenever the Gamma client successfully fetches a price
def persist_price(contract_id: str, price: float):
    """Save a Gamma API price to disk cache for resilience."""
    try:
        cache = {}
        if CACHE_FILE.exists():
            with open(CACHE_FILE) as f:
                cache = json.load(f)
        cache[contract_id] = {"price": price, "ts": time.time()}
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass
