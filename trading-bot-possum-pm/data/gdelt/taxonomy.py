"""
Possum PM -- Geopolitical GDELT Taxonomy
Adapted from Ellen's critical minerals taxonomy for prediction market use.

Defines:
  - GDELT theme sets for geopolitical filtering
  - Source credibility tiers (geopolitical outlets)
  - Headline false-positive filters
  - Non-event term filters
  - Contract-to-article matching logic
"""

import re
import logging

logger = logging.getLogger("possum.pm.gdelt.taxonomy")


# ======================================================================
# GDELT THEME TAXONOMY -- GEOPOLITICAL EVENTS
# ======================================================================
# Articles matching ANY of these themes are considered geopolitically
# relevant. Combined with contract keyword matching for precision.

GEOPOLITICAL_THEMES_PRIMARY = {
    # Direct conflict / military
    "ARMEDCONFLICT", "MILITARY", "KILL", "WOUND",
    "ASSASSINATION", "TERROR", "INSURGENCY", "REBELLION",
    "SIEGE", "ETHNIC_VIOLENCE", "UNREST", "UPRISING",

    # Diplomatic / political
    "CEASEFIRE", "PEACE", "NEGOTIATE", "DIPLOMAT",
    "LEADER", "ELECTION", "SOVEREIGNTY",
    "GENERAL_GOVERNMENT", "NATIONALIZATION",

    # Coercion / sanctions
    "SANCTIONS", "EMBARGO", "BLOCKADE", "BAN",
    "COERCE", "THREAT",

    # WMD / defense
    "WMD",

    # World Bank geopolitical themes
    "WB_585_DEFENSE_AND_SECURITY",
    "WB_586_DEFENSE_INDUSTRY",
    "WB_2432_FRAGILITY_CONFLICT_AND_VIOLENCE",
}

GEOPOLITICAL_THEMES_SECONDARY = {
    # Humanitarian / crisis
    "REFUGEE", "FAMINE",
    "SELF_IDENTIFIED_HUMANITARIAN_CRISIS",
    "STATE_OF_EMERGENCY",

    # Protest / labor
    "PROTEST", "STRIKE",

    # Maritime (strait of hormuz, etc.)
    "MARITIME", "MARITIME_INCIDENT", "PIRACY",

    # Governance
    "WB_578_ANTI_CORRUPTION",
    "WB_579_GOVERNANCE_INDICATORS",
    "TRIAL",
}

ALL_GEOPOLITICAL_THEMES = GEOPOLITICAL_THEMES_PRIMARY | GEOPOLITICAL_THEMES_SECONDARY


# ======================================================================
# SOURCE CREDIBILITY TIERS -- GEOPOLITICAL FOCUS
# ======================================================================
# Tier 1: Authoritative wire services, defense/foreign policy specialist
# Tier 2: Major general news outlets
# Tier 3: Everything else (default)

TIER1_SOURCES = {
    # Wire services
    "reuters.com", "apnews.com",

    # Major financial / business
    "bloomberg.com", "ft.com", "wsj.com", "cnbc.com",
    "marketwatch.com",

    # Defense / security specialist
    "defensenews.com", "defenseone.com", "defense-one.com",
    "breakingdefense.com", "janes.com", "thedrive.com",
    "warontherocks.com",

    # Foreign policy / geopolitics
    "foreignpolicy.com", "foreignaffairs.com",

    # Crisis / conflict specialist
    "crisisgroup.org", "iiss.org", "armscontrol.org",

    # Government / institutional
    "defense.gov", "state.gov", "centcom.mil",
    "nato.int", "un.org", "iaea.org",

    # Major international (authoritative)
    "bbc.com", "bbc.co.uk",
    "aljazeera.com", "aljazeera.net",
    "middleeasteye.net",

    # Regional authoritative
    "scmp.com",
    "kyivindependent.com",
    "timesofisrael.com", "haaretz.com",
}

TIER2_SOURCES = {
    # Major US news
    "nytimes.com", "washingtonpost.com", "cnn.com",
    "nbcnews.com", "cbsnews.com", "abcnews.go.com",
    "politico.com", "thehill.com", "axios.com",

    # Major international
    "theguardian.com", "economist.com",
    "france24.com", "dw.com",
    "rt.com", "tass.com",
    "xinhua.net", "globaltimes.cn",
    "euronews.com",

    # Regional
    "japantimes.co.jp", "straitstimes.com",
    "abc.net.au", "smh.com.au",
    "pravda.com.ua",

    # Think tanks
    "csis.org", "rand.org", "brookings.edu",
    "carnegieendowment.org", "cfr.org",

    # Trade / economics
    "tradingeconomics.com", "investing.com",
}


def classify_source_tier(source_name: str) -> int:
    """Classify source into credibility tier (1=highest, 3=lowest).
    Forked from Ellen's 2_extract.py classify_source_tier().
    """
    if not isinstance(source_name, str):
        return 3
    s = source_name.lower().strip()
    for domain in TIER1_SOURCES:
        if domain in s:
            return 1
    for domain in TIER2_SOURCES:
        if domain in s:
            return 2
    return 3


# ======================================================================
# HEADLINE FALSE-POSITIVE FILTER
# ======================================================================
# Two-tier system (from Ellen's 2_extract.py):
#   Strong blocklist: bypasses whitelist (very specific non-news patterns)
#   Regular blocklist: whitelist can override if article has geopolitical context

HEADLINE_STRONG_BLOCKLIST = [
    re.compile(r"\b(recipe|recipes|cooking|chef|restaurant)\b", re.I),
    re.compile(
        r"\b(playoff|championship|season finale|game recap|box score)\b", re.I
    ),
    re.compile(
        r"\b(album release|movie review|box office|trailer|concert|lyrics)\b",
        re.I,
    ),
    re.compile(r"\b(horoscope|zodiac|astrology)\b", re.I),
    re.compile(r"\b(skincare|makeup|fashion show|bridal)\b", re.I),
    re.compile(
        r"\b(museum|gallery|exhibit)\b.{0,40}"
        r"\b(opens?|visit|tickets?|admission)\b",
        re.I,
    ),
]

HEADLINE_BLOCKLIST = [
    re.compile(r"\b(bitcoin|ethereum|crypto|nft|blockchain|defi)\b", re.I),
    re.compile(r"\bbest\b.{0,20}\b\d{4}\b", re.I),
    re.compile(r"\bbest\b.{0,30}\b(buy|review|pick|guide)\b", re.I),
    re.compile(
        r"\b(laptop|phone|tablet|headphone)\s+(review|deal)\b", re.I
    ),
    re.compile(r"\b(wedding|engagement ring|anniversary gift)\b", re.I),
    re.compile(r"\b(home decor|interior design|kitchen remodel)\b", re.I),
    re.compile(
        r"\b(vitamin|supplement|diet plan|weight loss|skincare)\b", re.I
    ),
    re.compile(r"\b(obituary|funeral|memorial service)\b", re.I),
    re.compile(
        r"\b(cpu|gpu)\s+(cooler|fan|heatsink)\b", re.I
    ),
]

HEADLINE_WHITELIST = [
    re.compile(
        r"\b(military|missile|strike|attack|bomb|war|conflict)\b", re.I
    ),
    re.compile(
        r"\b(sanctions|embargo|blockade|ceasefire|peace|treaty)\b", re.I
    ),
    re.compile(
        r"\b(president|prime minister|defense|defence|pentagon|nato)\b", re.I
    ),
    re.compile(r"\b(nuclear|enrichment|uranium|warhead)\b", re.I),
    re.compile(
        r"\b(troops|soldiers|navy|army|air force|carrier)\b", re.I
    ),
    re.compile(r"\b(diplomacy|negotiations|summit|accord)\b", re.I),
]


def headline_is_false_positive(headline: str) -> bool:
    """Check if headline matches known false-positive patterns.
    Returns True if the headline should be rejected.

    Two-tier system from Ellen's 2_extract.py:
      Strong blocklist: bypasses whitelist
      Regular blocklist: whitelist can override
    """
    if not isinstance(headline, str) or not headline.strip():
        return False

    # Strong blocklist -- no whitelist override
    for pattern in HEADLINE_STRONG_BLOCKLIST:
        if pattern.search(headline):
            return True

    # Regular blocklist -- whitelist can save
    for pattern in HEADLINE_BLOCKLIST:
        if pattern.search(headline):
            for wp in HEADLINE_WHITELIST:
                if wp.search(headline):
                    return False
            return True

    return False


# ======================================================================
# NON-EVENT FILTER
# ======================================================================
# Adapted from Ellen's 4_clean.py mineral_non_event_filter()

GEOPOLITICAL_NON_EVENT_TERMS = {
    "non_news": [
        "press release", "sponsored", "advertisement",
        "webinar", "podcast", "blog post",
    ],
    "lifestyle": [
        "recipe", "cookbook", "restaurant review",
        "fashion", "jewelry", "engagement ring",
    ],
    "entertainment": [
        "movie", "film", "concert", "album",
        "music video", "celebrity", "reality tv",
        "award show", "box office",
    ],
    "sports": [
        "playoff", "championship", "tournament",
        "match result", "season record", "box score",
    ],
    "tech_product": [
        "phone review", "laptop review", "app store",
        "software update", "gadget",
    ],
    "health_beauty": [
        "skincare", "supplement", "diet plan",
        "workout", "yoga", "meditation retreat",
    ],
}

GEOPOLITICAL_OVERRIDE_TERMS = [
    "military", "missile", "strike", "attack", "war", "conflict",
    "sanctions", "ceasefire", "peace", "treaty", "diplomacy",
    "nuclear", "enrichment", "defense", "defence", "troops", "navy",
    "president", "prime minister", "foreign minister",
    "pentagon", "nato", "carrier", "airbase",
]


def is_non_event(headline: str, url: str) -> bool:
    """Check if article is a non-event (lifestyle, entertainment, etc.).
    Returns True if article should be excluded.

    Adapted from Ellen's 4_clean.py mineral_non_event_filter().
    """
    h = headline.lower() if isinstance(headline, str) else ""
    u = url.lower() if isinstance(url, str) else ""
    combined = h + " " + u

    # Override: if article has strong geopolitical signal, keep it
    if any(t in combined for t in GEOPOLITICAL_OVERRIDE_TERMS):
        return False

    # Check non-event categories
    for terms in GEOPOLITICAL_NON_EVENT_TERMS.values():
        if any(t in combined for t in terms):
            return True

    return False


# ======================================================================
# CONTRACT-TO-ARTICLE MATCHING
# ======================================================================

def match_article_to_contract(
    text_norm: str,
    article_themes: set,
    contract: dict,
) -> tuple[bool, list[str]]:
    """Check if a normalized article text matches a contract.

    Matching logic:
      1. Text must contain at least one SUBJECT keyword (who/where)
      2. AND (text contains at least one EVENT keyword (what)
             OR article has at least one matching GDELT theme)

    If contract lacks keywords_subject, falls back to requiring
    at least 2 keyword matches from the flat 'keywords' list.

    Returns:
        (matched: bool, matched_keywords: list[str])
    """
    subject_kws = contract.get("keywords_subject")
    event_kws = contract.get("keywords_event", [])
    contract_themes = set(contract.get("gdelt_themes", []))

    if subject_kws:
        # New-style matching: subject + (event OR theme)
        subject_hits = [kw for kw in subject_kws if kw.lower() in text_norm]
        if not subject_hits:
            return False, []

        event_hits = [kw for kw in event_kws if kw.lower() in text_norm]
        theme_hit = bool(article_themes & contract_themes)

        if event_hits or theme_hit:
            return True, subject_hits + event_hits
        return False, []

    # Fallback: old-style flat keywords (require at least 2 matches)
    all_kws = contract.get("keywords", [])
    matched = [kw for kw in all_kws if kw.lower() in text_norm]
    if len(matched) >= 2:
        return True, matched
    return False, []
