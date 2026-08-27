/**
 * Live demo orchestrator. Injects a failure, then drives the full autonomous cycle -
 * triage, investigate, propose, approve, remediate, verify - through the real backend, guard,
 * audit and incident-history modules, with human-paced delays and a live event at each step.
 *
 * This is the deterministic "the video cannot break" path. The authentic run (TrueForge/Claude
 * calling the MCP tools) exercises the same code; this simply narrates it end to end on demand.
 * Sim backend + demo mode only.
 */

import * as sim from "./cluster.js";
import type { Scenario } from "./cluster.js";
import { backend } from "./backend.js";
import * as incident from "./incident.js";
import * as incidents from "./incidents.js";
import * as audit from "./audit.js";
import { triageAlert } from "./triage.js";
import { recordInvestigation } from "./cost.js";
import { safeAction, gatedAction } from "./remediation.js";
import { emit } from "./events.js";

const SERVICE = "checkout";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Plan {
  scenario: Scenario;
  alert: string;
  fix: string;
  remediate: () => void;
}

const PLANS: Record<Scenario, Plan> = {
  oom: {
    scenario: "oom",
    alert: "checkout OOMKilled in prod (pager)",
    fix: "bump_memory to 512Mi",
    remediate: () => {
      safeAction("restart_pod", SERVICE, () => backend.restartPods(SERVICE));
      gatedAction("delete_pvc", "orders-db-pvc", () => backend.deletePvc("orders-db-pvc"));
      gatedAction("bump_memory", SERVICE, () => backend.bumpMemory(SERVICE, 512));
    },
  },
  crashloop: {
    scenario: "crashloop",
    alert: "checkout CrashLoopBackOff after deploy",
    fix: "rollback_deploy",
    remediate: () => gatedAction("rollback_deploy", SERVICE, () => backend.rollbackDeploy(SERVICE)),
  },
  imagepull: {
    scenario: "imagepull",
    alert: "checkout ImagePullBackOff: bad image tag",
    fix: "rollback_deploy",
    remediate: () => gatedAction("rollback_deploy", SERVICE, () => backend.rollbackDeploy(SERVICE)),
  },
};

let running = false;

/** True while a demo run is in flight (endpoint guards against overlapping runs). */
export function demoRunning(): boolean {
  return running;
}

/** Inject a failure without remediating - the sim resets to the chosen failing scenario. */
export function injectFailure(scenario: Scenario): void {
  sim.setScenario(scenario);
  incident.resetIncident();
  emit({ kind: "signal", target: SERVICE, severity: "danger", message: `Alert firing: ${PLANS[scenario].alert}` });
}

/** Drive the full cycle to resolution, emitting a live event at each step. Fire-and-forget. */
export async function runDemo(scenario: Scenario): Promise<void> {
  if (running) return;
  running = true;
  const plan = PLANS[scenario];
  try {
    sim.setScenario(scenario);
    incident.resetIncident();
    emit({ kind: "phase", phase: "triage", target: SERVICE, severity: "danger", message: `Alert received: ${plan.alert}` });
    await sleep(900);

    const t = triageAlert(plan.alert);
    emit({ kind: "signal", phase: "triage", severity: t.is_noise ? "info" : "warn", message: `Triage: ${t.severity}${t.is_noise ? " (noise)" : " (real)"}` });
    await sleep(900);

    emit({ kind: "phase", phase: "investigate", target: SERVICE, severity: "info", message: `Investigating ${SERVICE}` });
    recordInvestigation();
    const inv = backend.investigate(SERVICE);
    incident.setInvestigation(SERVICE, inv);
    const snap = incident.getInvestigation();
    const memBefore = backend.serviceHealth(SERVICE).memLimitMib;
    if (snap) incidents.openIncident(snap, plan.alert, audit.all().length, memBefore);
    emit({ kind: "signal", phase: "investigate", severity: "warn", message: `Root cause: ${inv.root_cause}` });
    await sleep(1100);

    emit({ kind: "proposal", phase: "remediate", severity: "info", message: `Proposed fix: ${plan.fix}` });
    await sleep(800);
    emit({ kind: "gate", phase: "remediate", severity: "warn", message: "Awaiting approval in TrueForge (destructive action gated)" });
    await sleep(1100);
    emit({ kind: "gate", phase: "remediate", severity: "success", message: "Approved by operator" });
    await sleep(500);

    plan.remediate(); // emits action/refusal events via the audit path
    await sleep(1100);

    emit({ kind: "phase", phase: "verify", target: SERVICE, severity: "info", message: `Verifying ${SERVICE}` });
    await sleep(800);
    const health = backend.serviceHealth(SERVICE);
    incidents.closeIncident(SERVICE, health.healthy, audit.all(), health.memLimitMib);
    emit({
      kind: health.healthy ? "resolved" : "verify",
      phase: "verify",
      target: SERVICE,
      severity: health.healthy ? "success" : "danger",
      message: health.healthy ? `${SERVICE} healthy again - incident resolved` : `${SERVICE} still unhealthy`,
    });
  } finally {
    running = false;
  }
}
