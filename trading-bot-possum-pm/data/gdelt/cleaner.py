"""
Possum PM -- GDELT Article Cleaner & Deduplicator
Forked from Ellen's 3_merge.py (URL dedup, wire syndication collapse)
and 4_clean.py (headline cleaning, fuzzy dedup).

Operates in-memory on article dicts (not CSV files).
"""

import re
import logging

logger = logging.getLogger("possum.pm.gdelt.cleaner")


# ======================================================================
# HEADLINE CORRUPTION CHECK (from Ellen's 4_clean.py)
# ======================================================================

def is_corrupted_headline(headline: str) -> bool:
    """Check if a headline is corrupted / garbage.
    Adapted from Ellen's 4_clean.py is_corrupted_headline().
    """
    if not headline or not isinstance(headline, str):
        return True

    headline = headline.strip()

    # Length checks
    if len(headline) < 5 or len(headline) > 300:
        return True

    # Must contain at least one letter
    if not re.search(r"[a-zA-Z]", headline):
        return True

    # High digit ratio
    non_space = re.sub(r"\s", "", headline)
    if non_space and len(re.findall(r"\d", non_space)) / len(non_space) > 0.7:
        return True

    # Known garbage patterns
    garbage_patterns = [
        r"^\d+$",
        r"^[\d\s\-_\.]+$",
        r"^[a-f0-9]{32}$",
        r"^[a-f0-9-]{36}$",
        r"^(index|home|main|default|page|error|404|403|500)$",
        r"^\w{1,3}$",
        r"^[A-Z]{3,}\d+$",
        r"^\d{4}-\d{2}-\d{2}",
        r"^(untitled|unknown|na|n\/a|null|undefined)$",
        r"^[^\w\s]{3,}$",
        r"^(\w+\s*){1,2}$",
    ]
    for p in garbage_patterns:
        if re.match(p, headline.lower().strip()):
            return True

    # High proportion of "bad" words (short, no vowels)
    words = headline.split()
    if len(words) >= 3:
        bad = sum(
            1 for w in words
            if len(w) <= 2 or not re.search(r"[aeiou]", w.lower())
        )
        if bad / len(words) > 0.6:
            return True

    return False


def clean_headline(headline: str) -> str | None:
    """Clean a headline by removing long digit sequences.
    From Ellen's 4_clean.py clean_headline_digits().
    """
    if not isinstance(headline, str):
        return None
    h = re.sub(r"\b\d{6,}\b", "", headline)
    h = re.sub(r"\s+", " ", h).strip()
    if re.fullmatch(r"\d+", h):
        return None
    return h or None


# ======================================================================
# DEDUPLICATION PIPELINE
# ======================================================================

def deduplicate_articles(articles: list[dict]) -> list[dict]:
    """Deduplicate a list of article dicts.

    Three-stage dedup (adapted from Ellen's 3_merge.py + 4_clean.py):
      1. URL dedup: same URL + same contract_id -> keep first
      2. Wire syndication collapse: same headline + same contract_id -> keep highest-tier source
      3. Fuzzy headline dedup (optional, if rapidfuzz available)

    Also cleans corrupted headlines.
    """
    if not articles:
        return []

    before = len(articles)

    # Stage 0: Clean headlines
    for article in articles:
        headline = article.get("headline", "")
        if headline and is_corrupted_headline(headline):
            article["headline"] = ""
        elif headline:
            cleaned = clean_headline(headline)
            article["headline"] = cleaned or ""

    # Stage 1: URL dedup (per contract)
    seen_urls = set()
    url_deduped = []
    for article in articles:
        key = (article["url"], article["contract_id"])
        if key not in seen_urls:
            seen_urls.add(key)
            url_deduped.append(article)

    url_removed = before - len(url_deduped)
    if url_removed:
        logger.debug("  URL dedup: removed %d duplicates", url_removed)

    # Stage 2: Wire syndication collapse (per contract)
    # Same headline from multiple outlets -- keep the highest-tier source
    headline_groups: dict[tuple[str, str], list[dict]] = {}
    no_headline = []

    for article in url_deduped:
        headline = article.get("headline", "").strip()
        if not headline:
            no_headline.append(article)
            continue
        key = (headline, article["contract_id"])
        if key not in headline_groups:
            headline_groups[key] = []
        headline_groups[key].append(article)

    syndication_deduped = []
    for group in headline_groups.values():
        # Keep the one with the best (lowest) source tier
        best = min(group, key=lambda a: a.get("source_tier", 3))
        # Track source count for context
        best["source_count"] = len(group)
        syndication_deduped.append(best)

    # Include articles without headlines (they passed URL dedup)
    syndication_deduped.extend(no_headline)
    syn_removed = len(url_deduped) - len(syndication_deduped)
    if syn_removed:
        logger.debug(
            "  Syndication collapse: removed %d duplicates", syn_removed,
        )

    # Stage 3: Fuzzy headline dedup (optional)
    result = _fuzzy_dedup(syndication_deduped)

    total_removed = before - len(result)
    if total_removed:
        logger.info(
            "  Dedup pipeline: %d -> %d articles (%d removed)",
            before, len(result), total_removed,
        )

    return result


def _fuzzy_dedup(
    articles: list[dict],
    threshold: float = 0.82,
) -> list[dict]:
    """Fuzzy headline dedup using rapidfuzz.
    Adapted from Ellen's 4_clean.py dedup_headlines().

    Groups similar headlines (per contract) and keeps the best source.
    Falls back to exact-only dedup if rapidfuzz is not available.
    """
    try:
        from rapidfuzz import fuzz
    except ImportError:
        logger.debug("rapidfuzz not available, skipping fuzzy dedup")
        return articles

    # Split by contract_id for per-contract dedup
    by_contract: dict[str, list[dict]] = {}
    for article in articles:
        cid = article["contract_id"]
        if cid not in by_contract:
            by_contract[cid] = []
        by_contract[cid].append(article)

    result = []
    for cid, group in by_contract.items():
        # Only fuzzy-dedup articles WITH headlines
        with_headline = [
            a for a in group if a.get("headline", "").strip()
        ]
        without_headline = [
            a for a in group if not a.get("headline", "").strip()
        ]

        if len(with_headline) <= 1:
            result.extend(with_headline)
            result.extend(without_headline)
            continue

        # Skip fuzzy dedup for very large sets (too slow for O(n^2))
        if len(with_headline) > 500:
            logger.debug(
                "  Skipping fuzzy dedup for %s (%d articles, too many)",
                cid, len(with_headline),
            )
            result.extend(with_headline)
            result.extend(without_headline)
            continue

        # Fuzzy grouping (O(n^2) but n is small)
        headlines = [a["headline"] for a in with_headline]
        n = len(headlines)
        group_ids = [-1] * n
        gid = 0

        for i in range(n):
            if group_ids[i] != -1:
                continue
            group_ids[i] = gid
            for j in range(i + 1, n):
                if group_ids[j] != -1:
                    continue
                ratio = fuzz.token_set_ratio(headlines[i], headlines[j]) / 100.0
                if ratio >= threshold:
                    group_ids[j] = group_ids[i]
            gid += 1

        # Merge groups: keep best source tier, longest headline
        groups_map: dict[int, list[dict]] = {}
        for idx, g in enumerate(group_ids):
            if g not in groups_map:
                groups_map[g] = []
            groups_map[g].append(with_headline[idx])

        for g_articles in groups_map.values():
            best = min(g_articles, key=lambda a: a.get("source_tier", 3))
            # Use longest headline from the group
            best["headline"] = max(
                (a["headline"] for a in g_articles), key=len,
            )
            best["source_count"] = best.get("source_count", 1) + len(
                g_articles
            ) - 1
            result.append(best)

        fuzzy_removed = len(with_headline) - len(groups_map)
        if fuzzy_removed:
            logger.debug(
                "  Fuzzy dedup for %s: merged %d articles",
                cid, fuzzy_removed,
            )

        result.extend(without_headline)

    return result
