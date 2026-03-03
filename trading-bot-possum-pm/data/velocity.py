"""
Possum PM -- Velocity Checker (Phase 2: Real GDELT Data)
Downloads GDELT GKG files, extracts articles matching active contracts,
and computes velocity ratios against a rolling baseline.

Velocity ratio = (articles in last 48h) / (30-day baseline avg per 48h window).
A ratio of 4.0x means 4x more articles than the 30-day average.

Architecture:
  1. Generate GKG filenames for the last N hours (configurable, default 6h)
  2. Skip files already processed (tracked in gdelt_processed_files table)
  3. Download + extract + match articles to contracts (via extractor.py)
  4. Clean + deduplicate (via cleaner.py)
  5. Store matched articles in gdelt_articles table
  6. Compute velocity ratio from SQLite data (48h vs 30-day baseline)

The baseline builds incrementally over time. First few runs will have
limited data -- returns default_velocity (1.0) until min_baseline_days
of data is accumulated.
"""

import logging
from datetime import datetime, timedelta, timezone

from database.db import get_db
from data.gdelt.extractor import (
    generate_gkg_filenames,
    process_time_range,
)
from data.gdelt.cleaner import deduplicate_articles

logger = logging.getLogger("possum.pm.velocity")


class VelocityChecker:
    """Check article velocity for prediction market contracts.

    Phase 2: Downloads real GDELT GKG data, stores in SQLite,
    and computes velocity ratios against a rolling baseline.
    """

    def __init__(self):
        from config import get_config
        self.cfg = get_config()
        self._refreshed = False
        self._contracts = self.cfg.contracts

    def _ensure_refreshed(self) -> None:
        """Download and process new GKG files if not already done this run.

        Called lazily on first velocity/headline query. Downloads GKG files
        for the configured lookback period, processes them for all contracts,
        and stores results in SQLite.
        """
        if self._refreshed:
            return

        self._refreshed = True
        db = get_db()
        gdelt_cfg = self.cfg.gdelt

        # Generate filenames for the lookback period
        filenames = generate_gkg_filenames(
            lookback_hours=gdelt_cfg.lookback_hours,
        )

        if not filenames:
            logger.warning(
                "No GKG filenames generated (lookback_hours=%d)",
                gdelt_cfg.lookback_hours,
            )
            return

        # Check which files have already been processed
        already_processed = self._get_processed_files(db)
        new_files = [f for f in filenames if f not in already_processed]

        if not new_files:
            logger.info(
                "GDELT: all %d files already processed, nothing to download",
                len(filenames),
            )
            return

        logger.info(
            "GDELT: %d new files to download (%d already processed)",
            len(new_files), len(already_processed & set(filenames)),
        )

        # Cap files per run for safety
        if len(new_files) > gdelt_cfg.max_files_per_run:
            logger.warning(
                "Capping GDELT download to %d files (requested %d)",
                gdelt_cfg.max_files_per_run, len(new_files),
            )
            new_files = new_files[: gdelt_cfg.max_files_per_run]

        # Download and extract articles
        raw_articles = process_time_range(
            filenames=new_files,
            contracts=self._contracts,
            download_timeout=gdelt_cfg.download_timeout,
            already_processed=already_processed,
        )

        # Deduplicate
        cleaned_articles = deduplicate_articles(raw_articles)

        # Store in SQLite
        stored = self._store_articles(db, cleaned_articles)
        logger.info(
            "GDELT: stored %d new articles (%d raw, %d after dedup)",
            stored, len(raw_articles), len(cleaned_articles),
        )

        # Mark files as processed
        now_str = datetime.now(timezone.utc).isoformat()
        for fname in new_files:
            count = sum(
                1 for a in cleaned_articles
                if a["gkg_timestamp"] == fname
            )
            try:
                db.execute_insert(
                    "INSERT OR REPLACE INTO gdelt_processed_files "
                    "(filename, processed_at, articles_found) "
                    "VALUES (?, ?, ?)",
                    (fname, now_str, count),
                )
            except Exception as e:
                logger.warning(
                    "Failed to mark %s as processed: %s", fname, e,
                )

    def get_velocity_ratio(self, contract: dict) -> float:
        """Return the velocity ratio for a contract.

        velocity = (articles in last 48h) / (30-day baseline avg per 48h)

        If insufficient baseline data (< min_baseline_days), returns
        the configured default_velocity.
        """
        self._ensure_refreshed()

        db = get_db()
        contract_id = contract["id"]
        now = datetime.now(timezone.utc)
        gdelt_cfg = self.cfg.gdelt

        # Count articles in last 48 hours
        ts_48h = (now - timedelta(hours=48)).strftime("%Y%m%d%H%M%S")
        row = db.fetch_one(
            "SELECT COUNT(*) as cnt FROM gdelt_articles "
            "WHERE contract_id = ? AND gkg_timestamp >= ?",
            (contract_id, ts_48h),
        )
        count_48h = row["cnt"] if row else 0

        # Count articles in last 30 days
        ts_30d = (now - timedelta(days=30)).strftime("%Y%m%d%H%M%S")
        row = db.fetch_one(
            "SELECT COUNT(*) as cnt FROM gdelt_articles "
            "WHERE contract_id = ? AND gkg_timestamp >= ?",
            (contract_id, ts_30d),
        )
        count_30d = row["cnt"] if row else 0

        # Check how many days of data we have
        row = db.fetch_one(
            "SELECT MIN(gkg_timestamp) as earliest "
            "FROM gdelt_articles WHERE contract_id = ?",
            (contract_id,),
        )
        earliest = row["earliest"] if row and row["earliest"] else None

        if earliest:
            try:
                earliest_dt = datetime.strptime(
                    earliest[:14], "%Y%m%d%H%M%S",
                )
                earliest_dt = earliest_dt.replace(tzinfo=timezone.utc)
                days_of_data = (
                    (now - earliest_dt).total_seconds() / 86400
                )
            except (ValueError, TypeError):
                days_of_data = 0
        else:
            days_of_data = 0

        # Not enough baseline data
        if days_of_data < gdelt_cfg.min_baseline_days:
            ratio = gdelt_cfg.default_velocity
            logger.info(
                "Velocity for %s: %.1fx (insufficient baseline -- "
                "%.1f days of data, need %d; 48h count=%d)",
                contract_id, ratio, days_of_data,
                gdelt_cfg.min_baseline_days, count_48h,
            )
            return ratio

        # Compute baseline: average articles per 48h window
        # over the available data period
        num_windows = max(1, days_of_data / 2)
        baseline_per_48h = count_30d / num_windows

        # Minimum baseline of 1 article per 48h to avoid division by zero
        if baseline_per_48h < 1.0:
            baseline_per_48h = 1.0

        ratio = count_48h / baseline_per_48h

        logger.info(
            "Velocity for %s: %.1fx (48h=%d, 30d=%d, "
            "baseline=%.1f/48h, %.1f days of data)",
            contract_id, ratio, count_48h, count_30d,
            baseline_per_48h, days_of_data,
        )

        return round(ratio, 2)

    def get_headline_sample(
        self, contract: dict, limit: int = 5,
    ) -> list[str]:
        """Return sample headlines for Grok context.

        Returns the most recent headlines matching this contract,
        preferring T1/T2 sources.
        """
        self._ensure_refreshed()

        db = get_db()
        contract_id = contract["id"]

        # Get recent headlines, preferring better sources
        ts_48h = (
            datetime.now(timezone.utc) - timedelta(hours=48)
        ).strftime("%Y%m%d%H%M%S")

        rows = db.fetch_all(
            "SELECT headline, source_name, source_tier "
            "FROM gdelt_articles "
            "WHERE contract_id = ? AND gkg_timestamp >= ? "
            "AND headline != '' AND headline IS NOT NULL "
            "ORDER BY source_tier ASC, gkg_timestamp DESC "
            "LIMIT ?",
            (contract_id, ts_48h, limit * 2),
        )

        if not rows:
            # Fall back to older articles if no recent ones
            rows = db.fetch_all(
                "SELECT headline, source_name, source_tier "
                "FROM gdelt_articles "
                "WHERE contract_id = ? "
                "AND headline != '' AND headline IS NOT NULL "
                "ORDER BY gkg_timestamp DESC "
                "LIMIT ?",
                (contract_id, limit),
            )

        # Deduplicate by headline text and take top N
        seen = set()
        headlines = []
        for row in rows:
            h = row["headline"].strip()
            if h and h not in seen:
                seen.add(h)
                headlines.append(h)
                if len(headlines) >= limit:
                    break

        if headlines:
            logger.info(
                "Headlines for %s: %d samples (from GDELT)",
                contract_id, len(headlines),
            )
        else:
            logger.info(
                "Headlines for %s: none available yet", contract_id,
            )

        return headlines

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_processed_files(self, db) -> set:
        """Get set of already-processed GKG filenames from SQLite."""
        try:
            rows = db.fetch_all(
                "SELECT filename FROM gdelt_processed_files",
            )
            return {row["filename"] for row in rows}
        except Exception:
            return set()

    def _store_articles(self, db, articles: list[dict]) -> int:
        """Store article matches in SQLite. Returns count of new rows."""
        now_str = datetime.now(timezone.utc).isoformat()
        stored = 0

        for article in articles:
            try:
                db.execute_insert(
                    "INSERT OR IGNORE INTO gdelt_articles "
                    "(gkg_record_id, gkg_timestamp, source_name, url, "
                    "headline, contract_id, matched_keywords, "
                    "source_tier, avg_tone, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        article.get("gkg_record_id", ""),
                        article["gkg_timestamp"],
                        article.get("source_name", ""),
                        article["url"],
                        article.get("headline", ""),
                        article["contract_id"],
                        article.get("matched_keywords", ""),
                        article.get("source_tier", 3),
                        article.get("avg_tone", 0.0),
                        now_str,
                    ),
                )
                stored += 1
            except Exception as e:
                # UNIQUE constraint violation is expected (OR IGNORE)
                if "UNIQUE" not in str(e):
                    logger.warning(
                        "Failed to store article %s: %s",
                        article.get("url", "?"), e,
                    )

        return stored
