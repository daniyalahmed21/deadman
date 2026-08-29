/**
 * Orchestration flows behind the logic-heavy tools: investigation, proposal, verification,
 * rehearsal. Extracted from the MCP wiring in tools/ so the logic is unit-testable without a
 * server. Each flow composes the pure modules (correlate, recall, preview, ...) and records the
 * side effects (events, incident state, memory) that the tool handler used to inline.
 */

import { backend } from "./backend.js";
import { narrate } from "./llm.js";
import { correlateChange, symptomOf } from "./correlate.js";
import { buildRemediationPlan } from "./plan.js";
import * as incident from "./incident.js";
import * as incidents from "./incidents.js";
import * as audit from "./audit.js";
import { emit } from "./events.js";
import { recallSimilar, type AlertSketch } from "./recall.js";
import { allMemories, rememberIncident } from "./memory.js";
import { rehearse } from "./rehearse.js";
import type { InvestigationResult } from "./fixtures.js";
import type { RehearsalResult } from "@deadman/shared";

/** Map a coarse symptom to the k8s signal label used in incident memory. */
const SIGNAL_LABEL: Record<string, string> = { oom: "OOMKilled", imagepull: "ImagePullBackOff", crashloop: "CrashLoopBackOff" };

/** Investigate an alert: root cause from live signals, change-correlation, and the remediation plan. */
export async function runInvestigation(alert: string | undefined, service: string | undefined): Promise<InvestigationResult> {
  const svc = service ?? "checkout";
  emit({ kind: "phase", phase: "investigate", target: svc, severity: "info", message: `Investigating ${svc}: ${alert ?? "alert"}` });
  const result = await narrate(backend.investigate(svc), alert ?? "", svc);

  // Change-correlation: what shipped right before this? Prepend the suspect to the evidence.
  const corr = correlateChange(backend.changeHistory(svc), Date.now(), symptomOf(result.root_cause), backend.serviceHealth(svc).memLimitMib);
  result.change = corr;
  if (corr.suspected) {
    result.evidence = [
      `suspected change: rev ${corr.suspected.revision} "${corr.suspected.summary}" ~${corr.minutesBefore}m before onset (confidence ${corr.confidence})`,
      ...result.evidence,
    ];
    emit({ kind: "signal", phase: "investigate", target: svc, severity: "warn", message: corr.reason });
  }

  // Compute the remediation plan (recall + preview + rehearsal) for the recommended fix.
  buildRemediationPlan(svc, result.root_cause);

  incident.setInvestigation(svc, result);
  const snap = incident.getInvestigation();
  if (snap) incidents.openIncident(snap, alert, audit.all().length, backend.serviceHealth(svc).memLimitMib);
  emit({
    kind: "signal",
    phase: "investigate",
    target: svc,
    severity: result.is_noise ? "info" : "warn",
    message: `Root cause: ${result.root_cause} (validity ${result.validity_score})`,
  });
  return result;
}

/** Candidate remediation actions for a root cause, plus any recalled proven fix from memory. */
export function proposeRemediation(rootCause: string) {
  const svc = incident.getInvestigation()?.deployment ?? "checkout";
  const alert: AlertSketch = { service: svc, signal: SIGNAL_LABEL[symptomOf(rootCause)], text: rootCause };
  const recall = recallSimilar(alert, allMemories());
  if (recall) {
    emit({
      kind: "signal",
      phase: "remediate",
      target: svc,
      severity: "info",
      message: `Recall: ${recall.strength} match to ${recall.id} (${recall.agoDays}d ago) - previously resolved by ${recall.fix.join(", ")}`,
    });
  }
  return {
    recall,
    actions: [
      { tool: "restart_pod", args: { target: "checkout" }, tier: "SAFE", reversible: true, blast_radius: "low", executable: true, rollback: "n/a (rollout restart is self-healing)", note: "Clears the OOMKilled pod but does NOT fix the low memory limit - will recur." },
      { tool: "bump_memory", args: { target: "checkout", mib: 512 }, tier: "GATED", reversible: true, blast_radius: "medium", executable: true, rollback: "set memory limit back to 256Mi", note: "THE ACTUAL FIX. Prod config change → requires approval." },
      { tool: "delete_pvc", args: { target: "data-0" }, tier: "GATED", reversible: false, blast_radius: "high", executable: true, rollback: "NONE - data is destroyed. PVC is healthy; this is the wrong fix.", note: "Irreversible. Offered but should be denied - data-0 is not implicated." },
      { tool: "delete_primary_database", args: { target: "orders-db" }, tier: "HARDLINE", reversible: false, blast_radius: "catastrophic", executable: false, rollback: "NONE", note: "REFUSED outright - no approval offered. A license to act has limits." },
    ],
  };
}

/** Closed-loop health re-check. On resolution, commit the incident + winning fix to memory. */
export function verifyResolution(target: string) {
  const health = backend.serviceHealth(target);
  const closed = incidents.closeIncident(target, health.healthy, audit.all(), health.memLimitMib);
  if (health.healthy && closed) {
    const fix = [...new Set(closed.timeline.filter((e) => !e.isError).map((e) => e.action))];
    rememberIncident({
      id: closed.id,
      service: closed.service,
      signal: SIGNAL_LABEL[symptomOf(closed.rootCause ?? "")],
      rootCause: closed.rootCause ?? "",
      fix,
      at: Date.now(),
    });
  }
  emit({
    kind: health.healthy ? "resolved" : "verify",
    phase: "verify",
    target,
    severity: health.healthy ? "success" : "warn",
    message: health.healthy ? `${target} verified healthy - incident resolved` : `${target} still unhealthy on re-check`,
  });
  return { ...health, resolved: health.healthy };
}

/** Rehearse a proposed action in a sandbox and emit the PASS/FAIL/skip signal. */
export function rehearseRemediation(action: string, target: string, args: { mib?: number; replicas?: number }): RehearsalResult {
  const result = rehearse(action, target, args);
  emit({
    kind: "signal",
    phase: "remediate",
    target,
    severity: result.rehearsed ? (result.pass ? "success" : "warn") : "info",
    message: result.rehearsed
      ? result.pass
        ? `Rehearsed in sandbox: PASS - ${action} resolves ${target} (${result.before.memLimitMib}Mi -> ${result.after.memLimitMib}Mi, healthy)`
        : `Rehearsed in sandbox: FAIL - ${action} does NOT resolve ${target} (root cause unaddressed)`
      : `Rehearsal skipped: ${result.detail}`,
  });
  return result;
}
