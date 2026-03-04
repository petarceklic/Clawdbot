"""
Possum PM — Polymarket Market Scanner
Discovers active markets from Polymarket Gamma API above a minimum liquidity threshold.
Auto-generates contract configs with keywords derived from market question text.

Usage:
    from data.market_scanner import scan_active_markets
    new_contracts = scan_active_markets(min_volume_usd=50000)
"""

import json
import logging
import re

logger = logging.getLogger("possum.pm.scanner")


def scan_active_markets(min_volume_usd: float = 50000, limit: int = 50) -> list[dict]:
    """
    Fetch active Polymarket markets above a minimum volume threshold.

    Args:
        min_volume_usd: Minimum 24h volume to include (default $50k)
        limit: Max markets to return

    Returns:
        List of contract dicts compatible with contracts.json format.
    """
    from data.polymarket import PolymarketClient

    client = PolymarketClient()

    # Fetch active markets sorted by volume
    raw = client._gamma_get(f"/markets?active=true&closed=false&limit={limit}&order=volume24hr&ascending=false")

    if not raw or not isinstance(raw, list):
        logger.warning("Market scanner: no markets returned from Gamma API")
        return []

    # Load existing contract IDs to avoid duplicates
    from config import CONTRACTS_PATH
    existing_ids = set()
    if CONTRACTS_PATH.exists():
        with open(CONTRACTS_PATH) as f:
            for c in json.load(f):
                existing_ids.add(c.get("id"))
                existing_ids.add(c.get("polymarket_slug"))

    new_contracts = []

    for market in raw:
        slug = market.get("slug", "")
        question = market.get("question", "")
        volume = float(market.get("volume24hr", 0) or 0)

        # Skip if below volume threshold
        if volume < min_volume_usd:
            continue

        # Skip if already tracked
        if slug in existing_ids:
            continue

        # Auto-generate contract ID from slug
        contract_id = slug or _slugify(question)
        if contract_id in existing_ids:
            continue

        # Extract keywords from question text
        keywords = _extract_keywords(question)

        # Determine contract type from keywords
        contract_type = _classify_contract(question, keywords)

        # Get resolution date if available
        end_date = market.get("endDate", "")
        if end_date:
            # Polymarket uses ISO format, extract date part
            resolution_date = end_date[:10] if "T" in end_date else end_date
        else:
            resolution_date = "2026-12-31"

        # Get current price
        price = PolymarketClient._extract_yes_price(market)

        contract = {
            "id": contract_id,
            "name": question[:100],  # Truncate long questions
            "polymarket_slug": slug,
            "manifold_search_term": _manifold_search(question),
            "contract_type": contract_type,
            "resolution_date": resolution_date,
            "keywords_subject": keywords["subject"],
            "keywords_event": keywords["event"],
            "gdelt_themes": _map_gdelt_themes(contract_type),
            "active": True,
            "source": "auto_scan",
            "volume_24h_usd": round(volume, 2),
            "current_price": price,
        }

        new_contracts.append(contract)
        logger.info(
            "Scanner found: %s (vol=$%.0f, price=$%.2f)",
            question[:60], volume, price or 0,
        )

    logger.info("Market scanner: %d new markets above $%.0f volume", len(new_contracts), min_volume_usd)
    return new_contracts


def _slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text[:80]


def _extract_keywords(question: str) -> dict:
    """Extract subject and event keywords from a market question."""
    q = question.lower()

    # Common subject entities
    subject = []
    event = []

    # Named entity patterns (simplified)
    entity_patterns = {
        "trump": ["trump", "donald trump", "president trump"],
        "biden": ["biden", "joe biden"],
        "china": ["china", "chinese", "beijing", "xi jinping", "prc"],
        "russia": ["russia", "russian", "putin", "moscow", "kremlin"],
        "ukraine": ["ukraine", "ukrainian", "kyiv", "zelensky"],
        "taiwan": ["taiwan", "taiwanese", "taipei"],
        "north korea": ["north korea", "dprk", "pyongyang", "kim jong un"],
        "iran": ["iran", "iranian", "tehran"],
        "fed": ["federal reserve", "fed", "fomc", "powell"],
        "bitcoin": ["bitcoin", "btc", "crypto"],
        "ai": ["artificial intelligence", "ai", "openai", "chatgpt"],
    }

    for entity, terms in entity_patterns.items():
        if any(t in q for t in terms):
            subject.extend(terms[:3])

    # Event patterns
    event_patterns = {
        "election": ["election", "vote", "polling", "primary", "ballot"],
        "war": ["war", "invasion", "attack", "strike", "conflict", "military"],
        "peace": ["peace", "ceasefire", "truce", "negotiations", "deal"],
        "economic": ["recession", "gdp", "unemployment", "inflation", "rate cut"],
        "market": ["stock market", "s&p 500", "nasdaq", "bull market", "bear market"],
        "regulation": ["regulation", "bill", "law", "ban", "executive order"],
        "trade": ["tariff", "trade war", "sanctions", "embargo"],
    }

    for category, terms in event_patterns.items():
        if any(t in q for t in terms):
            event.extend(terms[:4])

    # If we couldn't extract keywords, use cleaned words from the question
    if not subject:
        words = re.findall(r'\b[a-z]{4,}\b', q)
        # Filter common stop words
        stops = {"will", "what", "when", "does", "that", "this", "with", "from", "have", "been", "before", "after", "above", "below"}
        subject = [w for w in words if w not in stops][:5]

    if not event:
        event = subject[:3]

    return {"subject": list(set(subject))[:8], "event": list(set(event))[:8]}


def _classify_contract(question: str, keywords: dict) -> str:
    """Classify a contract as military, diplomatic, economic, or regulatory."""
    q = question.lower()

    military_terms = ["war", "invasion", "strike", "attack", "military", "nuclear", "missile"]
    economic_terms = ["recession", "gdp", "inflation", "rate", "tariff", "stock", "bitcoin", "market", "price"]
    diplomatic_terms = ["ceasefire", "peace", "treaty", "agreement", "negotiations", "acquisition"]
    regulatory_terms = ["regulation", "bill", "law", "ban", "legalize"]

    if any(t in q for t in military_terms):
        return "military"
    if any(t in q for t in diplomatic_terms):
        return "diplomatic"
    if any(t in q for t in regulatory_terms):
        return "regulatory"
    if any(t in q for t in economic_terms):
        return "economic"
    return "general"


def _manifold_search(question: str) -> str:
    """Generate a Manifold search term from a question."""
    # Strip common prefixes
    q = question
    for prefix in ["Will ", "Does ", "Is ", "Can ", "What ", "When "]:
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    # Take first ~40 chars, avoid cutting mid-word
    if len(q) > 40:
        q = q[:40].rsplit(" ", 1)[0]
    return q.strip("? ")


def _map_gdelt_themes(contract_type: str) -> list[str]:
    """Map contract type to relevant GDELT themes."""
    theme_map = {
        "military": ["ARMEDCONFLICT", "MILITARY", "WMD", "THREAT", "WB_585_DEFENSE_AND_SECURITY"],
        "diplomatic": ["CEASEFIRE", "PEACE", "NEGOTIATE", "DIPLOMAT", "LEADER"],
        "economic": ["ECON_STOCKMARKET", "ECON_WORLDCURRENCIES", "ECON_INFLATION", "ECON_DEBT"],
        "regulatory": ["GENERAL_GOVERNMENT", "LEGISLATION", "REGULATE"],
        "general": ["LEADER", "GENERAL_GOVERNMENT"],
    }
    return theme_map.get(contract_type, theme_map["general"])


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))
    logging.basicConfig(level=logging.INFO)

    markets = scan_active_markets(min_volume_usd=10000, limit=30)
    print(f"\nFound {len(markets)} markets:")
    for m in markets:
        print(f"  {m['name'][:60]:60s} vol=${m.get('volume_24h_usd', 0):>10,.0f}  price=${m.get('current_price', 0) or 0:.2f}")
