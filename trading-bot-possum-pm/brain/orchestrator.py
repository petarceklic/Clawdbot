"""
Possum PM — Pipeline Orchestrator
6-stage pipeline per contract:

  Stage 1 — Velocity Check (article velocity vs 30-day baseline)
  Stage 2 — Manifold + Polymarket Price (forecaster consensus + market price)
  Stage 3 — Alert Gate (velocity >= threshold OR gap >= 15pp)
  Stage 4 — Grok Evaluation (real-time X/Twitter search + analysis)
  Stage 5 — Variant Engine (V1-V5 independent evaluation)
  Stage 6 — Paper Trade Logging (JSON + SQLite, per variant)
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
        self._price_history: dict[str, list[dict]] = {}  # contract_id → [{timestamp, price}]
        self._load_price_history()

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

    def run_news_triggered_scan(self, dry_run: bool = False) -> dict:
        """
        Fast news-triggered scan: ask Grok to identify breaking stories,
        then immediately evaluate flagged contracts — bypassing velocity gate.

        Use this between regular pipeline runs to catch breaking news.
        """
        from agent.grok_agent import get_pm_grok_agent
        from data.manifold import ManifoldChecker
        from data.polymarket import PolymarketClient
        from data.velocity import VelocityChecker
        from tracking.pm_logger import log_paper_trade, log_decision

        run_id = f"news-{str(uuid.uuid4())[:8]}"
        contracts = self.cfg.contracts
        grok = get_pm_grok_agent()

        logger.info("=" * 60)
        logger.info("NEWS-TRIGGERED SCAN — Run %s", run_id)
        logger.info("=" * 60)

        # Step 1: Single cheap Grok call to scan for breaking news
        alerts = grok.scan_breaking_news(contracts)

        if not alerts:
            logger.info("No breaking news detected — skipping full evaluation")
            return {
                "status": "no_alerts",
                "run_id": run_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "alerts": [],
                "results": [],
            }

        # Step 2: For flagged contracts, run full evaluation (skip velocity gate)
        velocity = VelocityChecker()
        manifold = ManifoldChecker()
        polymarket = PolymarketClient()

        flagged_ids = {a["contract_id"] for a in alerts}
        results = []
        trades_logged = 0

        for contract in contracts:
            if contract["id"] not in flagged_ids:
                continue

            logger.info("-" * 40)
            logger.info("URGENT evaluation: %s", contract["name"])

            try:
                # Get current data but SKIP the velocity gate
                velocity_ratio = velocity.get_velocity_ratio(contract)
                headlines = velocity.get_headline_sample(contract)

                # Add breaking news headline from alert
                for a in alerts:
                    if a["contract_id"] == contract["id"]:
                        headlines.insert(0, f"[BREAKING] {a.get('headline', '')}")
                        break

                manifold_prob, _ = manifold.get_probability(contract)
                polymarket_price = polymarket.get_yes_price(contract)

                # Direct to Grok (bypass gate)
                grok_response = grok.evaluate_contract(
                    contract=contract,
                    velocity_ratio=velocity_ratio,
                    headlines=headlines,
                    manifold_probability=manifold_prob,
                    polymarket_price=polymarket_price,
                )

                if grok_response is None:
                    results.append({"contract_id": contract["id"], "status": "grok_failed"})
                    continue

                action = grok_response.get("action", "pass")
                if action in ("enter_yes", "enter_no") and not dry_run:
                    trade_direction = "yes" if action == "enter_yes" else "no"
                    logged = log_paper_trade(
                        run_id=run_id, contract=contract,
                        direction=trade_direction,
                        polymarket_price=polymarket_price,
                        manifold_probability=manifold_prob,
                        velocity_ratio=velocity_ratio,
                        grok_response=grok_response,
                        variant="V1",
                    )
                    if logged:
                        trades_logged += 1

                log_decision(
                    run_id=run_id, contract=contract, stage_reached=5,
                    velocity_ratio=velocity_ratio, velocity_triggered=True,
                    manifold_probability=manifold_prob,
                    polymarket_price=polymarket_price,
                    gap_pp=abs((manifold_prob or 0) - (polymarket_price or 0)) * 100,
                    gap_triggered=False, alert_passed=True,
                    grok_response=grok_response,
                    action_taken=f"news_triggered_{action}",
                )

                results.append({
                    "contract_id": contract["id"],
                    "status": "evaluated",
                    "grok_action": action,
                    "trade_logged": action in ("enter_yes", "enter_no"),
                })

            except Exception as e:
                logger.error("Failed to process urgent %s: %s", contract["id"], e)
                results.append({"contract_id": contract["id"], "status": "error"})

        logger.info("=" * 60)
        logger.info("NEWS SCAN COMPLETE: %d alerts, %d evaluated, %d trades", len(alerts), len(results), trades_logged)
        logger.info("=" * 60)

        return {
            "status": "completed",
            "run_id": run_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "alerts": alerts,
            "results": results,
            "trades_logged": trades_logged,
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

        # ── Stage 5: Variant Engine ──
        from variants.variant_engine import get_pm_variant_engine
        engine = get_pm_variant_engine()

        # Load price history for V4 momentum
        price_history = self._get_price_history(contract_id)

        signals = engine.evaluate(
            contract=contract,
            velocity_ratio=velocity_ratio,
            manifold_prob=manifold_prob,
            polymarket_price=polymarket_price,
            grok_response=grok_response,
            price_history=price_history,
        )

        logger.info(
            "  Stage 5 — Variants: %d triggered (%s)",
            len(signals),
            ", ".join(f"{s.variant}→{s.direction}" for s in signals) if signals else "none",
        )

        # ── Stage 6: Paper Trade Logging (per variant) ──
        trades_logged = 0

        for signal in signals:
            if dry_run:
                logger.info(
                    "  Stage 6 — DRY RUN: would log %s %s [%s] (conf=%.2f)",
                    signal.direction.upper(), contract_id, signal.variant, signal.confidence,
                )
            else:
                logged = log_paper_trade(
                    run_id=run_id,
                    contract=contract,
                    direction=signal.direction,
                    polymarket_price=polymarket_price,
                    manifold_probability=manifold_prob,
                    velocity_ratio=velocity_ratio,
                    grok_response=grok_response,
                    variant=signal.variant,
                )
                if logged:
                    trades_logged += 1
                    logger.info(
                        "  Stage 6 — Paper trade logged: %s %s [%s]",
                        signal.direction.upper(), contract_id, signal.variant,
                    )
                else:
                    logger.info(
                        "  Stage 6 — Trade skipped (dup/limit): %s %s [%s]",
                        signal.direction.upper(), contract_id, signal.variant,
                    )

        if not signals:
            logger.info("  Stage 6 — No variants triggered, no trade logged")

        # Record price snapshot for V4 momentum history
        if polymarket_price is not None:
            self._record_price(contract_id, polymarket_price)

        # Log decision regardless
        variant_codes = [s.variant for s in signals]
        log_decision(
            run_id=run_id,
            contract=contract,
            stage_reached=6,
            velocity_ratio=velocity_ratio,
            velocity_triggered=velocity_triggered,
            manifold_probability=manifold_prob,
            polymarket_price=polymarket_price,
            gap_pp=gap_pp,
            gap_triggered=gap_triggered,
            alert_passed=True,
            grok_response=grok_response,
            action_taken=f"trades_logged:{trades_logged}" if trades_logged > 0 else "pass",
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
            "trade_logged": trades_logged > 0,
            "trades_logged": trades_logged,
            "variants_triggered": variant_codes,
        }

    # ── Price History for V4 Momentum ──

    _PRICE_HISTORY_FILE = None  # set lazily

    def _get_price_history_path(self):
        if self._PRICE_HISTORY_FILE is None:
            from pathlib import Path
            self.__class__._PRICE_HISTORY_FILE = Path(__file__).parent.parent / "data" / "price_history.json"
        return self._PRICE_HISTORY_FILE

    def _load_price_history(self):
        """Load price history from disk (persists across runs for V4 momentum)."""
        import json
        path = self._get_price_history_path()
        try:
            if path.exists():
                with open(path) as f:
                    self._price_history = json.load(f)
                logger.debug("Loaded price history: %d contracts", len(self._price_history))
        except Exception:
            self._price_history = {}

    def _save_price_history(self):
        """Persist price history to disk."""
        import json
        path = self._get_price_history_path()
        try:
            with open(path, "w") as f:
                json.dump(self._price_history, f, indent=2)
        except Exception as e:
            logger.warning("Failed to save price history: %s", e)

    def _record_price(self, contract_id: str, price: float):
        """Record a price snapshot for V4 momentum tracking."""
        if contract_id not in self._price_history:
            self._price_history[contract_id] = []

        self._price_history[contract_id].append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "price": price,
        })

        # Keep last 20 snapshots (enough for momentum detection)
        self._price_history[contract_id] = self._price_history[contract_id][-20:]
        self._save_price_history()

    def _get_price_history(self, contract_id: str) -> list[dict] | None:
        """Get price history for a contract (for V4 momentum)."""
        history = self._price_history.get(contract_id)
        return history if history else None
