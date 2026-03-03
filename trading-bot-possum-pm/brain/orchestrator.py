"""
Possum PM — Pipeline Orchestrator
5-stage pipeline per contract:

  Stage 1 — Velocity Check (article velocity vs 30-day baseline)
  Stage 2 — Manifold + Polymarket Price (forecaster consensus + market price)
  Stage 3 — Alert Gate (velocity >= threshold OR gap >= 15pp)
  Stage 4 — Grok Evaluation (real-time X/Twitter search + analysis)
  Stage 5 — Paper Trade Logging (JSON + SQLite)
"""

import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("possum.pm.orchestrator")


class PMOrchestrator:
    """5-stage prediction market analysis pipeline."""

    def __init__(self):
        from config import get_config
        self.cfg = get_config()

    def run_pipeline(self, dry_run: bool = False) -> dict:
        """
        Run the full pipeline for all active contracts.

        Args:
            dry_run: If True, Grok is called but no trades are written to JSON.

        Returns:
            Summary dict with per-contract results.
        """
        from data.velocity import VelocityChecker
        from data.manifold import ManifoldChecker
        from data.polymarket import PolymarketClient
        from agent.grok_agent import get_pm_grok_agent
        from tracking.pm_logger import log_paper_trade, log_decision, write_baseline_structure

        run_id = str(uuid.uuid4())[:8]
        contracts = self.cfg.contracts

        logger.info("=" * 60)
        logger.info("POSSUM PM PIPELINE — Run %s", run_id)
        logger.info("Contracts: %d active", len(contracts))
        logger.info("Dry run: %s", dry_run)
        logger.info("=" * 60)

        if not contracts:
            logger.warning("No active contracts found in contracts.json")
            return {"status": "no_contracts", "run_id": run_id, "results": []}

        velocity = VelocityChecker()
        manifold = ManifoldChecker()
        polymarket = PolymarketClient()
        grok = get_pm_grok_agent()

        results = []
        grok_calls = 0
        trades_logged = 0

        for contract in contracts:
            contract_id = contract["id"]
            logger.info("-" * 40)
            logger.info("Processing: %s", contract["name"])

            try:
                result = self._process_contract(
                    contract=contract,
                    run_id=run_id,
                    velocity=velocity,
                    manifold=manifold,
                    polymarket=polymarket,
                    grok=grok,
                    dry_run=dry_run,
                    log_paper_trade=log_paper_trade,
                    log_decision=log_decision,
                )
                results.append(result)

                if result.get("grok_called"):
                    grok_calls += 1
                if result.get("trade_logged"):
                    trades_logged += 1

            except Exception as e:
                logger.error("Failed to process %s: %s", contract_id, e)
                results.append({
                    "contract_id": contract_id,
                    "status": "error",
                    "error": str(e),
                })

        # Write baseline structure (empty rolling arrays for Phase 2)
        try:
            write_baseline_structure(contracts)
        except Exception as e:
            logger.warning("Failed to write baseline: %s", e)

        # Update P&L on all open positions with current prices
        try:
            from tracking.pm_logger import update_open_positions_pnl
            updated = update_open_positions_pnl()
            if updated:
                logger.info("P&L updated for %d open positions", updated)
        except Exception as e:
            logger.warning("Failed to update open position P&L: %s", e)

        logger.info("=" * 60)
        logger.info(
            "PIPELINE COMPLETE: %d contracts, %d Grok calls, %d trades logged",
            len(contracts), grok_calls, trades_logged,
        )
        logger.info("=" * 60)

        return {
            "status": "completed",
            "run_id": run_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "contracts_checked": len(contracts),
            "grok_calls": grok_calls,
            "trades_logged": trades_logged,
            "dry_run": dry_run,
            "results": results,
        }

    def _process_contract(
        self,
        contract: dict,
        run_id: str,
        velocity,
        manifold,
        polymarket,
        grok,
        dry_run: bool,
        log_paper_trade,
        log_decision,
    ) -> dict:
        """Process a single contract through all 5 stages."""
        contract_id = contract["id"]

        # ── Stage 1: Velocity Check ──
        velocity_ratio = velocity.get_velocity_ratio(contract)
        headlines = velocity.get_headline_sample(contract)
        velocity_triggered = velocity_ratio >= self.cfg.pm.velocity_threshold

        logger.info(
            "  Stage 1 — Velocity: %.1fx (%s threshold %.1fx)",
            velocity_ratio,
            "TRIGGERED" if velocity_triggered else "below",
            self.cfg.pm.velocity_threshold,
        )

        # ── Stage 2: Manifold + Polymarket Price ──
        manifold_prob, manifold_meta = manifold.get_probability(contract)
        polymarket_price = polymarket.get_yes_price(contract)

        if manifold_prob is not None and polymarket_price is not None:
            gap_pp = abs(manifold_prob - polymarket_price) * 100
        else:
            gap_pp = 0.0

        gap_triggered = gap_pp >= self.cfg.pm.manifold_gap_threshold

        logger.info(
            "  Stage 2 — Manifold: %.1f%%, Polymarket: $%.2f, Gap: %.1fpp (%s)",
            (manifold_prob or 0) * 100,
            polymarket_price or 0,
            gap_pp,
            "TRIGGERED" if gap_triggered else "below threshold",
        )

        # ── Stage 3: Alert Gate ──
        alert_passed = velocity_triggered or gap_triggered

        if not alert_passed:
            logger.info("  Stage 3 — Alert gate: FAILED (no triggers)")
            log_decision(
                run_id=run_id,
                contract=contract,
                stage_reached=3,
                velocity_ratio=velocity_ratio,
                velocity_triggered=velocity_triggered,
                manifold_probability=manifold_prob,
                polymarket_price=polymarket_price,
                gap_pp=gap_pp,
                gap_triggered=gap_triggered,
                alert_passed=False,
                action_taken="gate_failed",
            )
            return {
                "contract_id": contract_id,
                "status": "gate_failed",
                "velocity_ratio": velocity_ratio,
                "gap_pp": round(gap_pp, 1),
                "grok_called": False,
                "trade_logged": False,
            }

        trigger_reasons = []
        if velocity_triggered:
            trigger_reasons.append(f"velocity {velocity_ratio:.1f}x")
        if gap_triggered:
            trigger_reasons.append(f"gap {gap_pp:.1f}pp")
        logger.info("  Stage 3 — Alert gate: PASSED (%s)", " + ".join(trigger_reasons))

        # ── Stage 4: Grok Evaluation ──
        logger.info("  Stage 4 — Calling Grok for evaluation...")
        grok_response = grok.evaluate_contract(
            contract=contract,
            velocity_ratio=velocity_ratio,
            headlines=headlines,
            manifold_probability=manifold_prob,
            polymarket_price=polymarket_price,
        )

        if grok_response is None:
            logger.warning("  Stage 4 — Grok returned None for %s", contract_id)
            log_decision(
                run_id=run_id,
                contract=contract,
                stage_reached=4,
                velocity_ratio=velocity_ratio,
                velocity_triggered=velocity_triggered,
                manifold_probability=manifold_prob,
                polymarket_price=polymarket_price,
                gap_pp=gap_pp,
                gap_triggered=gap_triggered,
                alert_passed=True,
                action_taken="grok_failed",
            )
            return {
                "contract_id": contract_id,
                "status": "grok_failed",
                "velocity_ratio": velocity_ratio,
                "gap_pp": round(gap_pp, 1),
                "grok_called": True,
                "trade_logged": False,
            }

        action = grok_response.get("action", "pass")
        direction = grok_response.get("direction", "neutral")
        confidence = grok_response.get("confidence", 0)

        logger.info(
            "  Stage 4 — Grok: direction=%s, confidence=%.2f, action=%s",
            direction, confidence, action,
        )

        # ── Stage 5: Paper Trade Logging ──
        trade_logged = False

        if action in ("enter_yes", "enter_no"):
            trade_direction = "yes" if action == "enter_yes" else "no"

            if dry_run:
                logger.info("  Stage 5 — DRY RUN: would log %s trade for %s", trade_direction, contract_id)
            else:
                trade_logged = log_paper_trade(
                    run_id=run_id,
                    contract=contract,
                    direction=trade_direction,
                    polymarket_price=polymarket_price,
                    manifold_probability=manifold_prob,
                    velocity_ratio=velocity_ratio,
                    grok_response=grok_response,
                )
                if trade_logged:
                    logger.info("  Stage 5 — Paper trade logged: %s %s", trade_direction.upper(), contract_id)
                else:
                    logger.info("  Stage 5 — Trade skipped (duplicate or at limit): %s %s", trade_direction.upper(), contract_id)
        else:
            logger.info("  Stage 5 — Grok says PASS, no trade logged")

        # Log decision regardless
        log_decision(
            run_id=run_id,
            contract=contract,
            stage_reached=5,
            velocity_ratio=velocity_ratio,
            velocity_triggered=velocity_triggered,
            manifold_probability=manifold_prob,
            polymarket_price=polymarket_price,
            gap_pp=gap_pp,
            gap_triggered=gap_triggered,
            alert_passed=True,
            grok_response=grok_response,
            action_taken="trade_logged" if trade_logged else "pass",
        )

        return {
            "contract_id": contract_id,
            "status": "evaluated",
            "velocity_ratio": velocity_ratio,
            "gap_pp": round(gap_pp, 1),
            "grok_called": True,
            "grok_direction": direction,
            "grok_confidence": confidence,
            "grok_action": action,
            "trade_logged": trade_logged,
        }
