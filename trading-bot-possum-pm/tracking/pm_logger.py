"""
Possum PM — Paper Trade & Decision Logger
Logs all contract evaluations to SQLite and paper trades to JSON + SQLite.
Includes P&L tracking: entry pricing, position sizing, unrealised/realised P&L.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from database.db import get_db

logger = logging.getLogger("possum.pm.logger")

PROJECT_DIR = Path(__file__).parent.parent
TRADES_JSON_PATH = PROJECT_DIR / "pm_trades.json"
BASELINE_JSON_PATH = PROJECT_DIR / "pm_baseline.json"


def log_paper_trade(
    run_id: str,
    contract: dict,
    direction: str,
    polymarket_price: float | None,
    manifold_probability: float | None,
    velocity_ratio: float,
    grok_response: dict,
    variant: str = "V1",
) -> bool:
    """
    Log a paper trade to both JSON and SQLite with P&L tracking.

    Returns True if the trade was logged, False if skipped (duplicate or at limit).
    """
    from config import get_config
    cfg = get_config()
    db = get_db()

    # Dedup: skip if already have an open position for this contract + direction + variant
    existing = db.fetch_one(
        "SELECT id FROM pm_trades WHERE contract_id = ? AND direction = ? AND variant = ? AND status = 'open'",
        (contract["id"], direction, variant),
    )
    if existing:
        logger.info(
            "Skipping duplicate: already have open %s position for %s",
            direction, contract["id"],
        )
        return False

    # Position limit check
    open_row = db.fetch_one(
        "SELECT COUNT(*) as cnt FROM pm_trades WHERE status = 'open' AND entry_price_usd IS NOT NULL"
    )
    open_count = open_row["cnt"] if open_row else 0
    if open_count >= cfg.pm.max_open_positions:
        logger.warning(
            "Max open positions (%d/%d) reached, skipping %s %s",
            open_count, cfg.pm.max_open_positions, direction, contract["id"],
        )
        return False

    now = datetime.now(timezone.utc).isoformat()

    # Calculate P&L fields
    entry_price = None
    notional = None
    quantity = None

    if polymarket_price is not None and polymarket_price > 0:
        if direction == "yes":
            entry_price = polymarket_price
        else:
            entry_price = 1.0 - polymarket_price

        if entry_price > 0:
            notional = cfg.pm.position_size_usd
            quantity = notional / entry_price

    trade_record = {
        "run_id": run_id,
        "timestamp_utc": now,
        "contract_id": contract["id"],
        "contract_name": contract["name"],
        "direction": direction,
        "variant": variant,
        "polymarket_price": polymarket_price,
        "manifold_probability": manifold_probability,
        "velocity_ratio": velocity_ratio,
        "grok_confidence": grok_response.get("confidence"),
        "grok_action": grok_response.get("action"),
        "grok_reasoning": grok_response.get("reasoning"),
        "suggested_entry": grok_response.get("suggested_entry"),
        "suggested_exit": grok_response.get("suggested_exit"),
        "estimated_probability": grok_response.get("estimated_probability"),
        "key_evidence": grok_response.get("key_evidence", []),
        "risk_flags": grok_response.get("risk_flags", []),
        "time_sensitivity": grok_response.get("time_sensitivity"),
        "meta": grok_response.get("_meta", {}),
    }

    # Write to JSON file (append to list)
    _append_to_json(TRADES_JSON_PATH, trade_record)

    # Write to SQLite with P&L columns
    try:
        db.execute_insert(
            """INSERT INTO pm_trades
               (run_id, timestamp_utc, contract_id, contract_name, direction, variant,
                polymarket_price, manifold_probability, velocity_ratio,
                grok_confidence, grok_action, grok_reasoning,
                suggested_entry, suggested_exit,
                entry_price_usd, notional_usd, quantity,
                current_price_usd, unrealised_pnl_usd)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (
                run_id, now, contract["id"], contract["name"], direction, variant,
                polymarket_price, manifold_probability, velocity_ratio,
                grok_response.get("confidence"),
                grok_response.get("action"),
                grok_response.get("reasoning"),
                grok_response.get("suggested_entry"),
                grok_response.get("suggested_exit"),
                entry_price,
                notional,
                quantity,
                entry_price,  # current_price starts at entry
            ),
        )
    except Exception as e:
        logger.error("Failed to write trade to SQLite: %s", e)

    logger.info(
        "Paper trade logged: %s %s [%s] @ $%.2f (entry=$%.4f, notional=$%.0f, qty=%.2f)",
        direction.upper(),
        contract["id"],
        variant,
        polymarket_price or 0,
        entry_price or 0,
        notional or 0,
        quantity or 0,
    )

    return True


def update_open_positions_pnl() -> int:
    """
    Fetch current Polymarket prices and update unrealised P&L on open positions.
    Called at end of each pipeline run. Returns count of positions updated.
    """
    from config import get_config
    from data.polymarket import PolymarketClient

    cfg = get_config()
    db = get_db()
    polymarket = PolymarketClient()

    open_trades = db.fetch_all(
        """SELECT id, contract_id, direction, entry_price_usd, quantity
           FROM pm_trades
           WHERE status = 'open' AND entry_price_usd IS NOT NULL"""
    )

    if not open_trades:
        return 0

    # Build contract lookup from config
    contracts_by_id = {c["id"]: c for c in cfg.contracts}
    updated = 0

    for trade in open_trades:
        contract = contracts_by_id.get(trade["contract_id"])
        if not contract:
            continue

        yes_price = polymarket.get_yes_price(contract)
        if yes_price is None:
            continue

        if trade["direction"] == "yes":
            current_price = yes_price
        else:
            current_price = 1.0 - yes_price

        unrealised = (current_price - trade["entry_price_usd"]) * trade["quantity"]

        db.execute(
            """UPDATE pm_trades
               SET current_price_usd = ?, unrealised_pnl_usd = ?
               WHERE id = ?""",
            (round(current_price, 6), round(unrealised, 4), trade["id"]),
        )
        updated += 1

    if updated:
        logger.info("Updated P&L for %d open positions", updated)
    return updated


def close_trade(trade_id: int, close_price: float, reason: str = "manual") -> None:
    """Close an open PM trade and compute realised P&L."""
    db = get_db()
    trade = db.fetch_one(
        "SELECT entry_price_usd, quantity FROM pm_trades WHERE id = ? AND status = 'open'",
        (trade_id,),
    )
    if not trade:
        logger.warning("Trade %d not found or already closed", trade_id)
        return

    realised = (close_price - trade["entry_price_usd"]) * trade["quantity"]
    now = datetime.now(timezone.utc).isoformat()

    db.execute(
        """UPDATE pm_trades
           SET status = 'closed', close_price_usd = ?, realised_pnl_usd = ?,
               close_timestamp_utc = ?, current_price_usd = ?, unrealised_pnl_usd = 0
           WHERE id = ?""",
        (close_price, round(realised, 4), now, close_price, trade_id),
    )
    logger.info("Trade %d closed (%s): realised P&L = $%.4f USD", trade_id, reason, realised)


def resolve_contract(contract_id: str, outcome: str) -> None:
    """
    Resolve all open trades for a contract.
    outcome: 'yes' or 'no' — the actual resolution.
    """
    db = get_db()
    open_trades = db.fetch_all(
        "SELECT id, direction FROM pm_trades WHERE contract_id = ? AND status = 'open'",
        (contract_id,),
    )
    for trade in open_trades:
        # If outcome matches direction, share resolves to $1. Otherwise $0.
        if trade["direction"] == outcome:
            price = 1.0
        else:
            price = 0.0
        close_trade(trade["id"], price, reason="resolution")

    logger.info(
        "Resolved %d trades for %s (outcome: %s)",
        len(open_trades), contract_id, outcome,
    )


def backfill_pnl_columns() -> None:
    """
    One-time backfill: deduplicate existing trades and fill P&L columns.
    Keeps only the first open trade per contract_id+direction; marks rest as 'skipped'.
    """
    from config import get_config
    cfg = get_config()
    db = get_db()

    # Step 1: Mark duplicates — keep lowest id per (contract_id, direction) among open trades
    dupes = db.fetch_all(
        """SELECT id FROM pm_trades
           WHERE status = 'open'
             AND id NOT IN (
                 SELECT MIN(id) FROM pm_trades
                 WHERE status = 'open'
                 GROUP BY contract_id, direction
             )"""
    )
    for dupe in dupes:
        db.execute("UPDATE pm_trades SET status = 'skipped' WHERE id = ?", (dupe["id"],))

    if dupes:
        logger.info("Marked %d duplicate trades as 'skipped'", len(dupes))

    # Step 2: Backfill P&L columns for trades missing them
    trades = db.fetch_all(
        """SELECT id, direction, polymarket_price
           FROM pm_trades
           WHERE entry_price_usd IS NULL
             AND polymarket_price IS NOT NULL
             AND status = 'open'"""
    )

    for trade in trades:
        pm_price = trade["polymarket_price"]
        if trade["direction"] == "yes":
            entry_price = pm_price
        else:
            entry_price = 1.0 - pm_price

        if entry_price <= 0:
            continue

        notional = cfg.pm.position_size_usd
        quantity = notional / entry_price

        db.execute(
            """UPDATE pm_trades
               SET entry_price_usd = ?, notional_usd = ?, quantity = ?,
                   current_price_usd = ?, unrealised_pnl_usd = 0
               WHERE id = ?""",
            (entry_price, notional, round(quantity, 4), entry_price, trade["id"]),
        )

    if trades:
        logger.info("Backfilled P&L columns for %d trades", len(trades))


def log_decision(
    run_id: str,
    contract: dict,
    stage_reached: int,
    velocity_ratio: float | None = None,
    velocity_triggered: bool = False,
    manifold_probability: float | None = None,
    polymarket_price: float | None = None,
    gap_pp: float | None = None,
    gap_triggered: bool = False,
    alert_passed: bool = False,
    grok_response: dict | None = None,
    action_taken: str = "gate_failed",
) -> None:
    """Log every contract evaluation to SQLite (pass or fail)."""
    now = datetime.now(timezone.utc).isoformat()

    try:
        db = get_db()
        db.execute_insert(
            """INSERT INTO pm_decisions
               (run_id, timestamp_utc, contract_id, contract_name,
                stage_reached, velocity_ratio, velocity_triggered,
                manifold_probability, polymarket_price, gap_pp, gap_triggered,
                alert_passed, grok_direction, grok_confidence, grok_action,
                grok_reasoning, action_taken)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id, now, contract["id"], contract["name"],
                stage_reached,
                velocity_ratio,
                1 if velocity_triggered else 0,
                manifold_probability,
                polymarket_price,
                gap_pp,
                1 if gap_triggered else 0,
                1 if alert_passed else 0,
                grok_response.get("direction") if grok_response else None,
                grok_response.get("confidence") if grok_response else None,
                grok_response.get("action") if grok_response else None,
                grok_response.get("reasoning") if grok_response else None,
                action_taken,
            ),
        )
    except Exception as e:
        logger.error("Failed to log decision for %s: %s", contract["id"], e)


def write_baseline_structure(contracts: list[dict]) -> None:
    """Create empty pm_baseline.json structure (populated in Phase 2)."""
    baseline = {}
    for c in contracts:
        baseline[c["id"]] = {
            "contract_name": c["name"],
            "resolution_date": c.get("resolution_date"),
            "rolling_velocity": [],
            "rolling_manifold": [],
            "rolling_polymarket": [],
            "rolling_gap": [],
        }

    with open(BASELINE_JSON_PATH, "w") as f:
        json.dump(baseline, f, indent=2)

    logger.info("Baseline structure written: %s (%d contracts)", BASELINE_JSON_PATH, len(contracts))


def _append_to_json(path: Path, record: dict) -> None:
    """Append a record to a JSON array file."""
    existing = []
    if path.exists():
        try:
            with open(path) as f:
                existing = json.load(f)
        except (json.JSONDecodeError, Exception):
            existing = []

    existing.append(record)

    with open(path, "w") as f:
        json.dump(existing, f, indent=2, default=str)
