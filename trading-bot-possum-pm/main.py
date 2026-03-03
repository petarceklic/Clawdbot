"""
Possum PM — Entry Point
Polymarket prediction market scanner.

Usage:
  python main.py              # Default: run pipeline once
  python main.py --once       # Run pipeline once and exit
  python main.py --dry-run    # Run pipeline, Grok called but no trades written
  python main.py --health     # Health check only
"""

import logging
import sys

from config import get_config
from database.db import get_db


def setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("possum_pm.log", mode="a"),
        ],
    )


def health_check() -> bool:
    """Check API key, database, and internet connectivity."""
    logger = logging.getLogger("possum.pm.health")
    all_ok = True

    # Check XAI API key
    config = get_config()
    if config.llm.xai_api_key:
        logger.info("Health [OK] XAI API key: configured (%d chars)", len(config.llm.xai_api_key))
    else:
        logger.error("Health [FAIL] XAI API key: not set")
        all_ok = False

    # Check database
    try:
        db = get_db()
        db.fetch_one("SELECT 1")
        logger.info("Health [OK] Database: %s", config.db_path)
    except Exception as e:
        logger.error("Health [FAIL] Database: %s", e)
        all_ok = False

    # Check contracts
    contracts = config.contracts
    logger.info("Health [OK] Contracts: %d active", len(contracts))

    # Check internet (Manifold API)
    try:
        import requests
        resp = requests.get("https://api.manifold.markets/v0/search-markets?term=test&limit=1", timeout=10)
        resp.raise_for_status()
        logger.info("Health [OK] Internet: Manifold API reachable")
    except Exception as e:
        logger.warning("Health [WARN] Internet: Manifold API unreachable (%s)", e)

    return all_ok


def main():
    config = get_config()
    setup_logging(config.log_level)
    logger = logging.getLogger("possum.pm.main")

    logger.info("=" * 50)
    logger.info("POSSUM PM — Polymarket Scanner")
    logger.info("Contracts: %d active", len(config.contracts))
    logger.info("=" * 50)

    # Initialise database
    db = get_db()
    logger.info("Database ready at %s", config.db_path)

    # Handle CLI args
    if "--health" in sys.argv:
        ok = health_check()
        logger.info("Health check %s", "PASSED" if ok else "FAILED")
        sys.exit(0 if ok else 1)

    dry_run = "--dry-run" in sys.argv

    if dry_run:
        logger.info("DRY RUN MODE — Grok called but no trades written to JSON")

    # Run pipeline
    from brain.orchestrator import PMOrchestrator
    orchestrator = PMOrchestrator()
    result = orchestrator.run_pipeline(dry_run=dry_run)

    logger.info("Pipeline result: %s", result.get("status"))
    logger.info("Grok calls: %d", result.get("grok_calls", 0))
    logger.info("Trades logged: %d", result.get("trades_logged", 0))

    # Print summary to stdout
    print()
    print("=" * 50)
    print("  POSSUM PM — RUN SUMMARY")
    print("=" * 50)
    print(f"  Status:     {result['status']}")
    print(f"  Run ID:     {result['run_id']}")
    print(f"  Contracts:  {result['contracts_checked']}")
    print(f"  Grok calls: {result['grok_calls']}")
    print(f"  Trades:     {result['trades_logged']}")
    print(f"  Dry run:    {result['dry_run']}")
    print("-" * 50)

    for r in result.get("results", []):
        status_icon = {
            "evaluated": ">>",
            "gate_failed": "--",
            "grok_failed": "!!",
            "error": "XX",
        }.get(r.get("status", ""), "??")

        line = f"  {status_icon} {r['contract_id']:30s}"
        if r.get("grok_called"):
            line += f"  Grok: {r.get('grok_action', '?'):10s} (conf: {r.get('grok_confidence', 0):.2f})"
        else:
            line += f"  vel={r.get('velocity_ratio', 0):.1f}x  gap={r.get('gap_pp', 0):.1f}pp"

        if r.get("trade_logged"):
            line += "  [TRADE]"
        print(line)

    print("=" * 50)
    print()


if __name__ == "__main__":
    main()
