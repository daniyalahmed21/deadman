/**
 * Sandbox rehearsal. Before a risky remediation touches prod, DEADMAN forks the cluster state,
 * applies the proposed action to the fork, and checks whether the fork became healthy - then
 * discards the fork. The fix is applied by the SAME causal mutators the prod path uses, so a
 * "PASS" is a causally honest claim within the model: a wrong fix (restart, delete_pvc) genuinely
 * fails to turn the fork healthy.
 *
 * Honesty: in `sim` mode the "sandbox" is an in-process deep-copy of the state, not a real
 * cluster. In `kind` mode we return `rehearsed:false` rather than fake a result - a real rehearsal
 * there would clone into an ephemeral namespace.
 *
 * Correctness: this calls the pure sim mutators directly (NOT the MCP tool handlers), so it never
 * arms the watchdog or writes the audit trail. Rehearsal has no side effects on prod.
 */

import * as sim from "./cluster.js";
import { backend } from "./backend.js";
import type { RehearsalResult } from "@deadman/shared";

const REHEARSABLE = new Set(["bump_memory", "rollback_deploy", "restart_pod", "scale_deployment"]);

/** Apply a proposed action inside the current (forked) state via the causal sim mutators. */
function applyInFork(action: string, target: string, args: { mib?: number; replicas?: number }): string {
  switch (action) {
    case "bump_memory":
      return sim.bumpMemory(target, args.mib ?? 0);
    case "rollback_deploy":
      return sim.rollbackDeploy(target);
    case "restart_pod":
      return sim.restartPods(target);
    case "scale_deployment":
      return sim.scaleDeploymentSim(target, args.replicas ?? 0);
    default:
      throw new Error(`no rehearsal model for ${action}`);
  }
}

export function isRehearsable(action: string): boolean {
  return REHEARSABLE.has(action);
}

/**
 * Rehearse `action` on `target` in an isolated fork and report whether the fork became healthy.
 * Prod state is always restored. Sim backend only; kind returns rehearsed:false.
 */
export function rehearse(action: string, target: string, args: { mib?: number; replicas?: number } = {}): RehearsalResult {
  const h = backend.serviceHealth(target);
  const snapshot = { healthy: h.healthy, memLimitMib: h.memLimitMib };

  if (backend.mode !== "sim") {
    return {
      action, target, backend: backend.mode, rehearsed: false, pass: false,
      before: snapshot, after: snapshot,
      detail: "kind backend: in-process rehearsal unavailable - would clone into an ephemeral namespace.",
    };
  }
  if (!REHEARSABLE.has(action)) {
    return {
      action, target, backend: "sim", rehearsed: false, pass: false,
      before: snapshot, after: snapshot,
      detail: `no rehearsal model for ${action}`,
    };
  }

  const saved = sim.snapshotState(); // fork point
  try {
    const outcome = applyInFork(action, target, args);
    const a = sim.snapshotHealth(target);
    const after = { healthy: a.healthy, memLimitMib: a.memLimitMib };
    return {
      action, target, backend: "sim", rehearsed: true, pass: a.healthy,
      before: snapshot, after,
      detail: a.healthy ? `fork became healthy: ${outcome}` : `fork still unhealthy after ${action}: ${outcome}`,
    };
  } finally {
    sim.restoreState(saved); // ALWAYS discard the fork - prod state untouched
  }
}
