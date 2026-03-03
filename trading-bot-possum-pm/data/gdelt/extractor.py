"""
Possum PM -- GDELT GKG Extractor
Forked from Ellen's 2_extract.py (critical minerals) for geopolitical PM use.

Downloads GDELT GKG v2.1 15-minute files, parses the 27-column schema,
and matches articles to active prediction market contracts.

Key infrastructure from Ellen's code:
  - download_gkg_csv()   -- download + unzip GKG CSV from GDELT server
  - GKG_COLUMNS          -- correct v2.1 27-column schema (V2Counts at index 6)
  - parse_v2themes()     -- parse semicolon-delimited theme+offset strings
  - parse_v2tone()       -- parse comma-delimited tone scores
  - extract_page_title() -- extract headline from XML Extras field
  - extract_headline_from_url() -- fallback headline from URL slug
  - normalize_text()     -- Unicode-aware text normalization

Replaced:
  - Mineral keyword taxonomy -> contract keyword matching
  - Mineral scoring -> contract relevance scoring
  - File-based output -> in-memory article list for SQLite storage
"""

import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from io import BytesIO
from urllib.parse import urlparse
from zipfile import ZipFile

import pandas as pd
import requests

from data.gdelt.taxonomy import (
    ALL_GEOPOLITICAL_THEMES,
    classify_source_tier,
    headline_is_false_positive,
    is_non_event,
    match_article_to_contract,
)

logger = logging.getLogger("possum.pm.gdelt.extractor")

# ======================================================================
# GDELT GKG v2.1 COLUMN SCHEMA
# ======================================================================
# Exact 27 columns from Ellen's 2_extract.py.
# Critical fix: V2Counts at index 6 was missing in v2.0, which shifted
# every column from index 6 onward.

GKG_COLUMNS = [
    "GKGRECORDID",               # 0
    "DATE",                       # 1
    "SourceCollectionIdentifier", # 2
    "SourceCommonName",           # 3
    "DocumentIdentifier",         # 4
    "V1Counts",                   # 5
    "V2Counts",                   # 6  -- was missing in v2.0
    "V1Themes",                   # 7
    "V2EnhancedThemes",           # 8
    "V1Locations",                # 9
    "V2EnhancedLocations",        # 10
    "V1Persons",                  # 11
    "V2EnhancedPersons",          # 12
    "V1Organizations",            # 13
    "V2EnhancedOrgs",             # 14
    "V2Tone",                     # 15
    "Dates",                      # 16
    "GCAM",                       # 17
    "SharingImage",               # 18
    "RelatedImages",              # 19
    "SocialImageEmbeds",          # 20
    "SocialVideoEmbeds",          # 21
    "Quotations",                 # 22
    "AllNames",                   # 23
    "Amounts",                    # 24
    "TranslationInfo",            # 25
    "Extras",                     # 26  -- contains PAGE_TITLE XML
]

GKG_BASE_URL = "http://data.gdeltproject.org/gdeltv2/{fname}.gkg.csv.zip"


# ======================================================================
# PARSING HELPERS (from Ellen's 2_extract.py)
# ======================================================================

def normalize_text(text: str) -> str:
    """Unicode-aware text normalization.
    From Ellen's 2_extract.py -- uses unicodedata for NFKD normalization
    and strips non-alphanumeric characters.
    """
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    # Replace non-letter/non-digit/non-space with space
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_v2themes(theme_string: str) -> set:
    """Parse V2EnhancedThemes field into a set of theme names.
    From Ellen's 2_extract.py.

    Format: "THEME1,offset;THEME2,offset;..."
    Returns: {"THEME1", "THEME2", ...}
    """
    if not isinstance(theme_string, str) or not theme_string.strip():
        return set()
    themes = set()
    for entry in theme_string.split(";"):
        entry = entry.strip()
        if entry:
            themes.add(entry.split(",")[0].strip())
    return themes


def parse_v2tone(tone_string: str) -> tuple[float, float, float]:
    """Parse V2Tone field into (avg_tone, positive, negative).
    From Ellen's 2_extract.py.

    Format: "avg,pos,neg,..."
    """
    if not isinstance(tone_string, str) or not tone_string.strip():
        return 0.0, 0.0, 0.0
    parts = tone_string.split(",")
    try:
        return (
            float(parts[0]),
            float(parts[1]) if len(parts) > 1 else 0.0,
            float(parts[2]) if len(parts) > 2 else 0.0,
        )
    except (ValueError, IndexError):
        return 0.0, 0.0, 0.0


def extract_page_title(xmlextras: str) -> str | None:
    """Extract headline from GKG Extras field (contains PAGE_TITLE XML).
    From Ellen's 2_extract.py.
    """
    if not isinstance(xmlextras, str) or pd.isna(xmlextras):
        return None
    match = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", xmlextras)
    return match.group(1).strip() if match else None


def extract_headline_from_url(url: str) -> str | None:
    """Fallback headline extraction from URL slug.
    From Ellen's 2_extract.py.
    """
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    slug = os.path.basename(parsed.path)
    slug = re.sub(r"[-_/]", " ", slug)
    slug = re.sub(r"\.html|\.htm|\.php|index$", "", slug).strip()
    return slug.capitalize() if len(slug.split()) >= 3 else None


def parse_source_language(translation_info: str) -> str:
    """Extract source language from TranslationInfo field.
    From Ellen's 2_extract.py.

    English articles have empty TranslationInfo.
    """
    if not isinstance(translation_info, str) or not translation_info.strip():
        return "en"
    match = re.search(r"srclc?:(\w+)", translation_info.lower())
    if match:
        return match.group(1)
    return "en"


# ======================================================================
# GKG FILE DOWNLOAD
# ======================================================================

def download_gkg_csv(url: str, timeout: int = 45) -> pd.DataFrame:
    """Download and decompress a GKG CSV from GDELT.
    From Ellen's 2_extract.py download_gkg_csv().

    Returns a DataFrame with raw string columns.
    """
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    with ZipFile(BytesIO(resp.content)) as z:
        with z.open(z.namelist()[0]) as f:
            return pd.read_csv(
                f, sep="\t", header=None, dtype=str,
                encoding_errors="ignore",
            )


# ======================================================================
# CORE EXTRACTION PIPELINE
# ======================================================================

def generate_gkg_filenames(
    lookback_hours: int = 6,
    from_time: datetime | None = None,
) -> list[str]:
    """Generate GKG filenames for the last N hours.

    GKG files are published every 15 minutes with names like:
      20260228120000.gkg.csv.zip

    GDELT has a ~30 minute delay, so we skip the most recent 30 minutes.

    Returns list of filenames (without extension).
    """
    if from_time is None:
        from_time = datetime.now(timezone.utc)

    # Skip most recent 30 minutes (GDELT publication delay)
    end = from_time - timedelta(minutes=30)
    start = end - timedelta(hours=lookback_hours)

    # Round to 15-minute boundaries
    def round_down_15(dt: datetime) -> datetime:
        minutes = (dt.minute // 15) * 15
        return dt.replace(minute=minutes, second=0, microsecond=0)

    start = round_down_15(start)
    end = round_down_15(end)

    filenames = []
    current = start
    while current <= end:
        filenames.append(current.strftime("%Y%m%d%H%M%S"))
        current += timedelta(minutes=15)

    return filenames


def process_gkg_file(
    filename: str,
    contracts: list[dict],
    download_timeout: int = 45,
) -> list[dict]:
    """Download and process one 15-minute GKG file.

    For each row in the GKG file:
      1. Parse themes from V2EnhancedThemes
      2. Build combined text from Extras + URL + themes
      3. Extract headline (PAGE_TITLE or URL slug)
      4. Normalize text for keyword matching
      5. Match against each active contract
      6. Apply headline false-positive filter
      7. Apply non-event filter

    Returns list of article dicts matching any contract.
    """
    url = GKG_BASE_URL.format(fname=filename)

    try:
        df = download_gkg_csv(url, timeout=download_timeout)
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.debug("GKG file not found (not yet published?): %s", filename)
            return []
        raise
    except Exception as e:
        logger.warning("Failed to download GKG %s: %s", filename, e)
        return []

    # Assign column names (handle files with fewer columns)
    if len(df.columns) < len(GKG_COLUMNS):
        df = df.reindex(columns=range(len(GKG_COLUMNS)))
    df.columns = GKG_COLUMNS[: len(df.columns)]

    # Parse themes
    df["_themes"] = df["V2EnhancedThemes"].apply(parse_v2themes)

    # Quick filter: only keep rows with at least one geopolitical theme
    # This dramatically reduces the number of rows to process
    df["_has_geo_theme"] = df["_themes"].apply(
        lambda t: bool(t & ALL_GEOPOLITICAL_THEMES)
    )

    # Build combined text for keyword matching
    # Include: Extras (PAGE_TITLE), URL, V1Themes
    df["_raw_text"] = (
        df["Extras"].fillna("")
        + " "
        + df["DocumentIdentifier"].fillna("")
        + " "
        + df["V1Themes"].fillna("")
    )

    # Extract headlines
    df["HEADLINE"] = df["Extras"].apply(extract_page_title)
    headline_from_url = df["DocumentIdentifier"].apply(extract_headline_from_url)
    df["HEADLINE"] = df["HEADLINE"].fillna(headline_from_url)

    # Add headline to raw text for keyword matching
    df["_raw_text"] = df["_raw_text"] + " " + df["HEADLINE"].fillna("")

    # Normalize text
    df["_text_norm"] = df["_raw_text"].apply(normalize_text)

    # Source tier
    df["_tier"] = df["SourceCommonName"].apply(classify_source_tier)

    # Tone
    tone = df["V2Tone"].apply(parse_v2tone)
    df["_avg_tone"] = tone.apply(lambda x: x[0])

    # Source language
    df["_lang"] = df["TranslationInfo"].apply(parse_source_language)

    # Match against contracts
    matches = []

    for idx, row in df.iterrows():
        text_norm = row["_text_norm"]
        themes = row["_themes"]
        headline = row.get("HEADLINE", "")
        url_str = row.get("DocumentIdentifier", "")
        has_geo_theme = row["_has_geo_theme"]

        # Skip rows with no headline and no geo theme (very likely noise)
        if not headline and not has_geo_theme:
            continue

        for contract in contracts:
            matched, matched_kws = match_article_to_contract(
                text_norm=text_norm,
                article_themes=themes,
                contract=contract,
            )

            if not matched:
                continue

            # Apply headline false-positive filter
            if headline and headline_is_false_positive(headline):
                continue

            # Apply non-event filter
            if is_non_event(headline or "", url_str):
                continue

            matches.append({
                "gkg_record_id": row.get("GKGRECORDID", ""),
                "gkg_timestamp": filename,
                "source_name": row.get("SourceCommonName", ""),
                "url": url_str,
                "headline": headline or "",
                "contract_id": contract["id"],
                "matched_keywords": ";".join(matched_kws),
                "source_tier": row["_tier"],
                "avg_tone": row["_avg_tone"],
                "source_language": row["_lang"],
            })

    logger.debug(
        "GKG %s: %d rows, %d matches across %d contracts",
        filename, len(df), len(matches), len(contracts),
    )

    return matches


def process_time_range(
    filenames: list[str],
    contracts: list[dict],
    download_timeout: int = 45,
    already_processed: set | None = None,
) -> list[dict]:
    """Process multiple GKG files and return all matched articles.

    Args:
        filenames: List of GKG filenames to process.
        contracts: Active contracts to match against.
        download_timeout: Timeout per file download.
        already_processed: Set of filenames already in the database (skip these).

    Returns:
        List of article dicts from all files.
    """
    if already_processed is None:
        already_processed = set()

    all_matches = []
    files_processed = 0
    files_skipped = 0

    for fname in filenames:
        if fname in already_processed:
            files_skipped += 1
            continue

        matches = process_gkg_file(
            filename=fname,
            contracts=contracts,
            download_timeout=download_timeout,
        )
        all_matches.extend(matches)
        files_processed += 1

        if matches:
            logger.info(
                "  GKG %s: %d article matches", fname, len(matches),
            )

    logger.info(
        "GDELT extraction: %d files processed, %d skipped, %d total matches",
        files_processed, files_skipped, len(all_matches),
    )

    return all_matches
