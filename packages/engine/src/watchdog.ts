/**
 * Auto-rollback watchdog. After a remediation, DEADMAN does not walk away - it watches the
 * target's health for a window and, if the fix does not hold, reverts it automatically using
 * the captured before-state. Reversibility is a first-class primitive: a bot you would let
 * touch prod is one that undoes its own mistakes.
 *
 * The core takes injectable health/sleep seams so it is unit-testable without real timers or
 * a real cluster.
 */

import { backend } from "./backend.js";
import { emit } from "./events.js";
import * as audit from "./audit.js";

export type WatchdogVerdict = "held" | "rolled_back";

export interface WatchdogConfig {
  target: string;
  /** revert action to run if the fix does not hold; returns an outcome string for the audit trail */
  undo: () => string;
  /** audit action name for the revert (should contain "rollback" so it streams as a rollback) */
  undoLabel?: string;
  windowMs?: number;
  intervalMs?: number;
  // test seams
  health?: (target: string) => { healthy: boolean };
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Watch `target` until it recovers (verdict "held") or the window elapses without recovery
 * (verdict "rolled_back" - the undo runs and is audited). Emits live events throughout.
 */
export async function armWatchdog(cfg: WatchdogConfig): Promise<WatchdogVerdict> {
  const windowMs = cfg.windowMs ?? 6000;
  const intervalMs = cfg.intervalMs ?? 1000;
  const undoLabel = cfg.undoLabel ?? "auto_rollback";
  const health = cfg.health ?? ((t) => backend.serviceHealth(t));
  const sleep = cfg.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  emit({
    kind: "verify",
    phase: "verify",
    target: cfg.target,
    severity: "info",
    message: `Watchdog armed - watching ${cfg.target} for ${Math.round(windowMs / 1000)}s`,
  });

  let waited = 0;
  while (waited < windowMs) {
    await sleep(intervalMs);
    waited += intervalMs;
    if (health(cfg.target).healthy) {
      emit({
        kind: "verify",
        phase: "verify",
        target: cfg.target,
        severity: "success",
        message: `Watchdog: ${cfg.target} recovered - fix held`,
      });
      return "held";
    }
  }

  // Window elapsed without recovery: revert. audit.record streams this as a rollback event.
  const outcome = cfg.undo();
  audit.record({ action: undoLabel, target: cfg.target, tier: "SAFE", outcome, isError: false });
  return "rolled_back";
}
