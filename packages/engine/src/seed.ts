/**
 * Demo seeder. Drives a handful of real incidents end-to-end through the same backend,
 * guard, classifier, audit and history modules the live tools use - so the history and
 * safety views show genuine records, not hand-written fixtures. Sim backend only.
 *
 * Order matters: the flagship OOM scenario runs last so its investigation is the one the
 * live cockpit reflects. Each scenario resets the sim to its failing state first.
 */

import * as sim from "./cluster.js";
import type { Scenario } from "./cluster.js";
import { backend } from "./backend.js";
import * as incident from "./incident.js";
import * as incidents from "./incidents.js";
import * as audit from "./audit.js";
import { classifyTool } from "./classifier.js";
import { guardDestructive } from "./guard.js";
import { recordInvestigation, resetCost } from "./cost.js";

const SERVICE = "checkout";

/** SAFE mutation: audited, never gated. */
function safeAction(tool: string, target: string, run: () => string): void {
  audit.record({ action: tool, target, tier: classifyTool(tool), outcome: run(), isError: false });
}

/** GATED mutation through the sensitive-target floor; a refusal is audited and never mutates. */
function gatedAction(tool: string, target: string, run: () => string): void {
  const tier = classifyTool(tool);
  const verdict = guardDestructive(tool, target);
  if (!verdict.allowed) {
    audit.record({ action: tool, target, tier, outcome: verdict.reason ?? "refused", isError: true });
    return;
  }
  audit.record({ action: tool, target, tier, outcome: run(), isError: false });
}

interface ScenarioPlan {
  scenario: Scenario;
  alert: string;
  /** the remediation sequence for this scenario, run after the investigation opens */
  remediate: () => void;
}

const PLANS: readonly ScenarioPlan[] = [
  {
    scenario: "crashloop",
    alert: "checkout CrashLoopBackOff after deploy",
    remediate: () => {
      gatedAction("rollback_deploy", SERVICE, () => backend.rollbackDeploy(SERVICE));
    },
  },
  {
    scenario: "imagepull",
    alert: "checkout ImagePullBackOff: bad image tag",
    remediate: () => {
      gatedAction("rollback_deploy", SERVICE, () => backend.rollbackDeploy(SERVICE));
    },
  },
  {
    scenario: "oom",
    alert: "checkout OOMKilled in prod (pager)",
    remediate: () => {
      // SAFE first-aid, then the over-eager wrong fix (refused), then the real fix.
      safeAction("restart_pod", SERVICE, () => backend.restartPods(SERVICE));
      gatedAction("delete_pvc", "orders-db-pvc", () => backend.deletePvc("orders-db-pvc"));
      gatedAction("bump_memory", SERVICE, () => backend.bumpMemory(SERVICE, 512));
    },
  },
];

/** Run one scenario as a genuine incident; returns nothing, mutates the shared stores. */
function runScenario(plan: ScenarioPlan): void {
  sim.setScenario(plan.scenario);
  recordInvestigation();

  const result = backend.investigate(SERVICE);
  incident.setInvestigation(SERVICE, result);
  const snap = incident.getInvestigation();
  if (!snap) return;

  const memBefore = backend.serviceHealth(SERVICE).memLimitMib;
  incidents.openIncident(snap, plan.alert, audit.all().length, memBefore);

  plan.remediate();

  const health = backend.serviceHealth(SERVICE);
  incidents.closeIncident(SERVICE, health.healthy, audit.all(), health.memLimitMib);
}

/** Wipe every demo-derived store together and replay the scenario set. No-op outside sim mode. */
export function seedDemoIncidents(): { seeded: number; skipped?: string } {
  if (backend.mode !== "sim") return { seeded: 0, skipped: "seed runs only against the sim backend" };
  // Reset all demo telemetry as one unit so repeated seeding is idempotent (audit, history, cost).
  audit.reset();
  incidents.resetIncidents();
  resetCost();
  for (const plan of PLANS) runScenario(plan);
  return { seeded: PLANS.length };
}
