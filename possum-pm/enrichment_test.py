#!/usr/bin/env python3
"""
enrichment_test.py — Confirmation layer scraper proof of concept
Target contract: "US strikes Iran by June 2026" (Polymarket)

Sources:
  1. Metaculus          — forecaster community probability
  2. Congress.gov API   — recent bills/hearings (iran, AUMF, war powers)
  3. Federal Register   — recent executive/agency docs mentioning iran
  4. CENTCOM website    — news articles flagged for Iran/naval/Persian Gulf
  5. MarineTraffic      — placeholder (structure only, real API wired later)

Usage:
  python3 enrichment_test.py
  python3 enrichment_test.py --source metaculus
  python3 enrichment_test.py --source congress
  python3 enrichment_test.py --source federal-register
  python3 enrichment_test.py --source centcom
  python3 enrichment_test.py --source marinetraffic
"""

import argparse
import json
import sys
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from bs4 import BeautifulSoup

# ─────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}
TIMEOUT = 15


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_run(fn, source_name: str) -> dict:
    """Wrap a source function — catches all errors, never crashes the pipeline."""
    try:
        result = fn()
        return {
            "source": source_name,
            "status": "ok",
            "fetched_at": now_iso(),
            "data": result,
        }
    except Exception as exc:
        return {
            "source": source_name,
            "status": "error",
            "fetched_at": now_iso(),
            "error": str(exc),
            "traceback": traceback.format_exc(limit=4),
        }


# ─────────────────────────────────────────────
# SOURCE 1 — Metaculus
# ─────────────────────────────────────────────

def fetch_metaculus() -> dict[str, Any]:
    """
    Fetches forecaster consensus from public prediction markets.

    Primary: Manifold Markets (fully open REST API, no auth)
    Secondary: Metaculus (note: aggressively blocks scrapers — requires auth token)

    Manifold is a good Metaculus proxy for PoC purposes — same structure,
    same data shape. Wire up Metaculus with a bearer token for prod.
    """
    questions = []

    # --- Primary: Manifold Markets ---
    try:
        url = "https://api.manifold.markets/v0/search-markets"
        params = {
            "term": "Iran strike",
            "filter": "open",
            "sort": "liquidity",
            "limit": 10,
        }
        resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        markets = resp.json()

        for m in markets:
            prob = m.get("probability")
            questions.append({
                "platform": "Manifold Markets",
                "title": m.get("question"),
                "url": m.get("url"),
                "community_probability": round(prob, 4) if prob is not None else None,
                "traders": m.get("uniqueBettorCount"),
                "total_liquidity": m.get("totalLiquidity"),
                "close_time": datetime.fromtimestamp(
                    m["closeTime"] / 1000, tz=timezone.utc
                ).strftime("%Y-%m-%dT%H:%M:%SZ") if m.get("closeTime") else None,
            })

        return {
            "query": "Iran strike",
            "platform_used": "Manifold Markets (open API)",
            "metaculus_note": (
                "Metaculus blocks unauthenticated API access. "
                "Set METACULUS_TOKEN env var for production."
            ),
            "total_found": len(questions),
            "questions": questions,
            "relevant_flag": len(questions) > 0,
        }

    except Exception as manifold_err:
        # If Manifold also fails, try Metaculus with token
        import os
        token = os.environ.get("METACULUS_TOKEN")
        if token:
            mc_url = "https://www.metaculus.com/api/posts/"
            hdrs = {**HEADERS, "Authorization": f"Token {token}"}
            params = {"search": "iran strikes", "type": "forecast", "status": "open", "limit": 10}
            resp = requests.get(mc_url, params=params, headers=hdrs, timeout=TIMEOUT)
            resp.raise_for_status()
            payload = resp.json()
            for q in payload.get("results", []):
                title = q.get("title") or q.get("question", {}).get("title", "")
                slug = q.get("url") or ""
                forecasters = q.get("forecasters_count") or q.get("nr_forecasters")
                questions.append({
                    "platform": "Metaculus",
                    "title": title,
                    "url": f"https://www.metaculus.com{slug}" if slug.startswith("/") else slug,
                    "community_probability": None,
                    "forecasters": forecasters,
                })
            return {
                "query": "iran strikes",
                "platform_used": "Metaculus (authenticated)",
                "total_found": len(questions),
                "questions": questions,
                "relevant_flag": len(questions) > 0,
            }

        raise RuntimeError(
            f"Manifold failed ({manifold_err}); Metaculus requires METACULUS_TOKEN env var."
        )


# ─────────────────────────────────────────────
# SOURCE 2 — Congress.gov API
# ─────────────────────────────────────────────

CONGRESS_KEYWORDS = ["iran", "military authorization", "war powers", "AUMF"]


def fetch_congress() -> dict[str, Any]:
    """
    Query Congress.gov for recent legislation related to Iran / AUMF / war powers.
    Uses the Congress.gov search page (no API key needed for PoC).
    Set env var CONGRESS_API_KEY for the authenticated REST API.
    """
    import os
    api_key = os.environ.get("CONGRESS_API_KEY")
    results = []

    if api_key:
        # Authenticated REST API — returns proper full-text search results
        seen_ids: set = set()
        for keyword in CONGRESS_KEYWORDS[:3]:
            url = "https://api.congress.gov/v3/bill"
            params = {
                "query": keyword,
                "limit": 5,
                "sort": "updateDate+desc",
                "api_key": api_key,
                "format": "json",
            }
            resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            for bill in data.get("bills", []):
                bill_id = f"{bill.get('congress')}-{bill.get('number')}"
                if bill_id in seen_ids:
                    continue
                seen_ids.add(bill_id)
                results.append({
                    "title": bill.get("title") or bill.get("shortTitle"),
                    "bill_number": bill.get("number"),
                    "congress": bill.get("congress"),
                    "type": bill.get("type"),
                    "date": bill.get("updateDate") or bill.get("latestAction", {}).get("actionDate"),
                    "status": bill.get("latestAction", {}).get("text"),
                    "keyword_hit": keyword,
                    "url": f"https://www.congress.gov/bill/{bill.get('congress')}th-congress/"
                           f"{bill.get('type', '').lower()}/{bill.get('number')}",
                })
                if len(results) >= 5:
                    break
            if len(results) >= 5:
                break
    else:
        # No API key — scrape congress.gov search results page
        for keyword in ["iran military strikes", "Iran AUMF war powers"]:
            search_url = (
                f"https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C"
                f"%22search%22%3A%22{requests.utils.quote(keyword)}%22%7D"
                f"&searchResultViewType=expanded"
            )
            hdrs = {**HEADERS, "Accept": "text/html"}
            resp = requests.get(search_url, headers=hdrs, timeout=TIMEOUT)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            for item in soup.select("li.expanded")[:5]:
                title_el = item.select_one("span.result-title a") or item.select_one("a.result-heading")
                date_el = item.select_one("span.result-item-date") or item.select_one("span.date")
                status_el = item.select_one("span.result-item-text") or item.select_one(".latest-action")

                if title_el:
                    href = title_el.get("href", "")
                    results.append({
                        "title": title_el.get_text(strip=True),
                        "date": date_el.get_text(strip=True) if date_el else None,
                        "status": status_el.get_text(strip=True) if status_el else None,
                        "keyword_hit": keyword,
                        "url": f"https://www.congress.gov{href}" if href.startswith("/") else href,
                    })
            if results:
                break

        if not results:
            # Last fallback — return a note about API key requirement
            return {
                "keywords_searched": CONGRESS_KEYWORDS,
                "api_key_configured": False,
                "note": (
                    "Set CONGRESS_API_KEY env var (free at api.congress.gov) for reliable results. "
                    "Web scrape fallback returned no parseable results."
                ),
                "total_results": 0,
                "bills": [],
                "relevant_flag": False,
            }

    return {
        "keywords_searched": CONGRESS_KEYWORDS,
        "api_key_configured": api_key is not None,
        "total_results": len(results),
        "bills": results,
        "relevant_flag": len(results) > 0,
    }


# ─────────────────────────────────────────────
# SOURCE 3 — Federal Register
# ─────────────────────────────────────────────

def fetch_federal_register() -> dict[str, Any]:
    """
    Query Federal Register public API for documents mentioning 'iran' in last 30 days.
    No auth required.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%m/%d/%Y")

    url = "https://www.federalregister.gov/api/v1/documents.json"
    params = {
        "conditions[term]": "iran",
        "conditions[publication_date][gte]": since,
        "per_page": 10,
        "order": "newest",
        "fields[]": ["title", "document_number", "type", "publication_date", "agencies", "abstract", "html_url"],
    }
    resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    documents = []
    for doc in data.get("results", []):
        agencies = [a.get("name") for a in doc.get("agencies", [])]
        documents.append({
            "title": doc.get("title"),
            "type": doc.get("type"),
            "date": doc.get("publication_date"),
            "agencies": agencies,
            "document_number": doc.get("document_number"),
            "abstract": (doc.get("abstract") or "")[:200],
            "url": doc.get("html_url"),
        })

    return {
        "query": "iran",
        "since": since,
        "total_found": data.get("count", len(documents)),
        "documents": documents,
        "relevant_flag": len(documents) > 0,
    }


# ─────────────────────────────────────────────
# SOURCE 4 — CENTCOM Website
# ─────────────────────────────────────────────

CENTCOM_KEYWORDS = ["iran", "naval", "persian gulf", "strait of hormuz", "middle east command", "arabian gulf"]


def fetch_centcom() -> dict[str, Any]:
    """
    Fetch CENTCOM news articles and flag Iran/naval/Persian Gulf mentions.
    Tries multiple access paths:
      1. RSS feed (most reliable, no bot blocking)
      2. Direct news page (may 403)
      3. Google News RSS for site:centcom.mil as fallback
    """
    import xml.etree.ElementTree as ET

    articles = []
    source_used = None

    # --- Attempt 1: CENTCOM official RSS feed ---
    rss_urls = [
        "https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=1&max=20",
        "https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=1&isdashboardselected=0&max=20",
        "https://www.centcom.mil/rss.xml",
    ]
    for rss_url in rss_urls:
        try:
            resp = requests.get(rss_url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 200 and "<item>" in resp.text:
                root = ET.fromstring(resp.text)
                ns = {"media": "http://search.yahoo.com/mrss/"}
                for item in root.findall(".//item"):
                    title = item.findtext("title", "").strip()
                    link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    description = item.findtext("description", "").strip()
                    combined = f"{title} {description}".lower()
                    relevant = any(kw in combined for kw in CENTCOM_KEYWORDS)
                    articles.append({
                        "title": title,
                        "url": link,
                        "date": pub_date,
                        "iran_relevant": relevant,
                        "matched_keywords": [kw for kw in CENTCOM_KEYWORDS if kw in combined],
                    })
                source_used = f"RSS: {rss_url}"
                break
        except Exception:
            continue

    # --- Attempt 2: Direct page scrape ---
    if not articles:
        try:
            hdrs = {
                **HEADERS,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
            }
            for url_try in [
                "https://www.centcom.mil/Media/News-Articles/",
                "https://www.centcom.mil/media/news/",
                "https://www.centcom.mil/News/",
            ]:
                resp = requests.get(url_try, headers=hdrs, timeout=TIMEOUT, allow_redirects=True)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    candidates = (
                        soup.select("a[href*='/Article/']")
                        or soup.select("h3 a") or soup.select("h2 a")
                        or [a for a in soup.find_all("a", href=True)
                            if "/News-Article" in a.get("href", "") or "/news-article" in a.get("href", "")]
                    )
                    seen: set = set()
                    for el in candidates:
                        t = el.get_text(strip=True)
                        href = el.get("href", "")
                        if not t or href in seen or len(t) < 10:
                            continue
                        seen.add(href)
                        t_lower = t.lower()
                        relevant = any(kw in t_lower for kw in CENTCOM_KEYWORDS)
                        articles.append({
                            "title": t,
                            "url": f"https://www.centcom.mil{href}" if href.startswith("/") else href,
                            "date": None,
                            "iran_relevant": relevant,
                            "matched_keywords": [kw for kw in CENTCOM_KEYWORDS if kw in t_lower],
                        })
                        if len(articles) >= 20:
                            break
                    if articles:
                        source_used = f"scrape: {url_try}"
                        break
        except Exception:
            pass

    # --- Attempt 3: Google News RSS (site:centcom.mil iran) ---
    if not articles:
        try:
            gnews_url = (
                "https://news.google.com/rss/search?"
                "q=site%3Acentcom.mil+iran&hl=en-US&gl=US&ceid=US%3Aen"
            )
            resp = requests.get(gnews_url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 200 and "<item>" in resp.text:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item"):
                    title = item.findtext("title", "").strip()
                    link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    if "centcom" in title.lower() or "centcom" in link.lower():
                        t_lower = title.lower()
                        relevant = any(kw in t_lower for kw in CENTCOM_KEYWORDS)
                        articles.append({
                            "title": title,
                            "url": link,
                            "date": pub_date,
                            "iran_relevant": relevant,
                            "matched_keywords": [kw for kw in CENTCOM_KEYWORDS if kw in t_lower],
                            "via": "Google News RSS",
                        })
            source_used = "Google News RSS (centcom.mil iran)"
        except Exception:
            pass

    flagged = [a for a in articles if a["iran_relevant"]]

    return {
        "source_used": source_used or "all attempts failed",
        "articles_scraped": len(articles),
        "flagged_count": len(flagged),
        "flagged_articles": flagged,
        "all_articles": articles[:20],
        "relevant_flag": len(flagged) > 0,
    }


# ─────────────────────────────────────────────
# SOURCE 5 — MarineTraffic (Placeholder)
# ─────────────────────────────────────────────

def fetch_marinetraffic() -> dict[str, Any]:
    """
    PLACEHOLDER — MarineTraffic requires a paid API key.
    This demonstrates the data structure the real implementation would return.
    Wire up with MT_API_KEY env var when available.

    Real endpoints to use:
      GET https://services.marinetraffic.com/api/exportvessel/v:8/{API_KEY}/
          ?timespan=60&mmsi=&msgtype=extended&protocol=json

    Vessel classes to monitor for Iran context:
      - US Navy surface combatants (carrier strike groups in Persian Gulf / Arabian Sea)
      - Iranian naval vessels (IRISL, IRGC Navy)
      - Tankers flagged as sanctioned
    """
    import os
    api_key = os.environ.get("MT_API_KEY")

    if api_key:
        # Real implementation would go here
        # resp = requests.get(f"https://services.marinetraffic.com/api/exportvessel/v:8/{api_key}/",
        #                     params={"timespan": 60, "msgtype": "extended", "protocol": "json"},
        #                     timeout=TIMEOUT)
        # data = resp.json()
        # ... parse and filter for relevant vessels
        pass

    return {
        "status": "placeholder",
        "api_key_configured": api_key is not None,
        "note": "Real MT API requires paid key. Set env var MT_API_KEY to enable.",
        "monitored_regions": ["Persian Gulf", "Arabian Sea", "Strait of Hormuz", "Gulf of Oman"],
        "vessel_types_of_interest": [
            "US Navy carrier strike group (CVN)",
            "US Navy destroyer (DDG)",
            "Iranian frigate / corvette",
            "IRGC patrol vessels",
            "Sanctioned Iranian tankers",
        ],
        "example_output_format": {
            "vessels_in_region": [
                {
                    "mmsi": "338234215",
                    "name": "USS EXAMPLE (DDG-99)",
                    "flag": "US",
                    "type": "Warship",
                    "lat": 26.12,
                    "lon": 56.34,
                    "speed": 12.4,
                    "heading": 270,
                    "last_updated": "2026-02-28T04:00:00Z",
                    "region": "Strait of Hormuz",
                    "alert_flag": True,
                }
            ],
            "us_navy_presence_level": "elevated",  # normal / elevated / surge
            "iranian_naval_activity": "routine",
        },
        "relevant_flag": False,
    }


# ─────────────────────────────────────────────
# Combined runner
# ─────────────────────────────────────────────

SOURCES = {
    "metaculus": ("Metaculus", fetch_metaculus),
    "congress": ("Congress.gov", fetch_congress),
    "federal-register": ("Federal Register", fetch_federal_register),
    "centcom": ("CENTCOM", fetch_centcom),
    "marinetraffic": ("MarineTraffic", fetch_marinetraffic),
}


def run_all() -> dict:
    results = {}
    for key, (name, fn) in SOURCES.items():
        print(f"  → Fetching {name}...", file=sys.stderr)
        results[key] = safe_run(fn, name)

    # Summary
    ok_sources = [k for k, v in results.items() if v["status"] == "ok"]
    error_sources = [k for k, v in results.items() if v["status"] == "error"]
    relevant_sources = [
        k for k, v in results.items()
        if v["status"] == "ok" and v.get("data", {}).get("relevant_flag", False)
    ]

    summary = {
        "contract": "US strikes Iran by June 2026 (Polymarket PoC)",
        "run_at": now_iso(),
        "sources_checked": len(SOURCES),
        "sources_ok": len(ok_sources),
        "sources_errored": len(error_sources),
        "sources_with_relevant_data": len(relevant_sources),
        "summary_line": (
            f"{len(relevant_sources)} of {len(SOURCES)} sources returned relevant data "
            f"({len(error_sources)} errors)"
        ),
        "error_sources": error_sources,
        "relevant_sources": relevant_sources,
    }

    return {"summary": summary, "results": results}


def run_single(source_key: str) -> dict:
    if source_key not in SOURCES:
        return {"error": f"Unknown source '{source_key}'. Valid: {list(SOURCES.keys())}"}
    name, fn = SOURCES[source_key]
    print(f"  → Testing {name} independently...", file=sys.stderr)
    return safe_run(fn, name)


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrichment layer scraper — Iran strikes PoC")
    parser.add_argument(
        "--source",
        choices=list(SOURCES.keys()),
        default=None,
        help="Test a single source independently (default: run all)",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        default=True,
        help="Pretty-print JSON output (default: True)",
    )
    args = parser.parse_args()

    if args.source:
        output = run_single(args.source)
    else:
        output = run_all()

    indent = 2 if args.pretty else None
    print(json.dumps(output, indent=indent, default=str))
