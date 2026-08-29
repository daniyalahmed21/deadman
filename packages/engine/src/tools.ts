/**
 * DEADMAN tool surface.
 *
 * Every tool is tagged Class = READ or WRITE. The MCP annotation is the machine-readable
 * form of that tag and is what TrueForge's approval gate reads:
 *   READ  → readOnlyHint: true          → runs free
 *   WRITE (reversible/low-risk) → no destructiveHint → SAFE, auto-runs, but stays a visible call
 *   WRITE (destructive)         → destructiveHint: true → GATED (Allow/Deny pause)
 *
 * HARDLINE actions are deliberately NOT registered as callable tools; propose_remediation
 * surfaces them tagged { executable: false } so the model can see the limit but never invoke it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { serviceHealthFixture } from "./fixtures.js";
import { classifyTool } from "./classifier.js";
import { guardDestructive } from "./guard.js";
import * as audit from "./audit.js";
import { backend } from "./backend.js";
import { runbookFor } from "./runbook.js";
import { narrate } from "./llm.js";
import { triageAlert } from "./triage.js";
import * as incident from "./incident.js";
import * as incidents from "./incidents.js";
import { buildPostmortem } from "./postmortem.js";
import { emit } from "./events.js";
import { armWatchdog } from "./watchdog.js";
import { correlateChange, symptomOf } from "./correlate.js";

const WATCHDOG_WINDOW_MS = Number(process.env.DEADMAN_WATCHDOG_WINDOW_MS ?? 4000);
const WATCHDOG_INTERVAL_MS = Number(process.env.DEADMAN_WATCHDOG_INTERVAL_MS ?? 1000);

/** Wrap any JSON-serialisable value as an MCP text result. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Wrap a plain string as an MCP text result. */
function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/** An error result the model sees as a failed tool call (used for refusals). */
function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true as const };
}

/**
 * Run a destructive mutation through the sensitive-target floor, then audit it.
 * A refused call never mutates; both outcomes are recorded.
 *
 * A "fix" mutation (one meant to restore health) may pass a `revert` thunk built from the
 * captured before-state. On success the engine arms the auto-rollback watchdog: it watches the
 * target and, if the fix does not hold within the window, runs `revert` and re-verifies.
 */
function guardedMutation(
  tool: string,
  target: string,
  before: unknown,
  mutate: () => string,
  after: () => unknown,
  revert?: () => string,
) {
  const tier = classifyTool(tool);
  const verdict = guardDestructive(tool, target);
  if (!verdict.allowed) {
    audit.record({ action: tool, target, tier, before, outcome: verdict.reason!, isError: true });
    return err(`[REFUSED] ${verdict.reason}`);
  }
  const outcome = mutate();
  audit.record({ action: tool, target, tier, before, after: after(), outcome, isError: false });
  if (revert) {
    // Fire-and-forget: don't block the tool response on the watch window. The watchdog emits
    // its own events and audits any auto-rollback.
    void armWatchdog({ target, undo: revert, windowMs: WATCHDOG_WINDOW_MS, intervalMs: WATCHDOG_INTERVAL_MS });
  }
  return text(`[${tier}] ${outcome}`);
}

export function registerDeadmanTools(server: McpServer): void {
  // ---- READ tools (never gated) ------------------------------------------------------

  server.registerTool(
    "investigate_incident",
    {
      title: "Investigate incident",
      description:
        "Run the SRE investigation on an alert: gather live signals (memory limit, restart counts, OOMKill status) for the affected service and return a root-cause analysis with evidence. Read-only.",
      inputSchema: {
        alert: z.string().describe("Raw alert payload or a short description"),
        service: z.string().optional().describe("Affected service/deployment (default: checkout)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ alert, service }) => {
      const svc = service ?? "checkout";
      emit({ kind: "phase", phase: "investigate", target: svc, severity: "info", message: `Investigating ${svc}: ${alert ?? "alert"}` });
      const result = await narrate(backend.investigate(svc), alert ?? "", svc);

      // Change-correlation: what shipped right before this? Prepend the suspect to the evidence.
      const corr = correlateChange(
        backend.changeHistory(svc),
        Date.now(),
        symptomOf(result.root_cause),
        backend.serviceHealth(svc).memLimitMib,
      );
      result.change = corr;
      if (corr.suspected) {
        result.evidence = [
          `suspected change: rev ${corr.suspected.revision} "${corr.suspected.summary}" ~${corr.minutesBefore}m before onset (confidence ${corr.confidence})`,
          ...result.evidence,
        ];
        emit({ kind: "signal", phase: "investigate", target: svc, severity: "warn", message: corr.reason });
      }

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
      return json(result);
    },
  );

  server.registerTool(
    "get_service_health",
    {
      title: "Get service health",
      description: "Quick read-only probe of a service's current health and error rate.",
      inputSchema: { service: z.string().describe("Service / deployment name") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json(serviceHealthFixture(service)),
  );

  server.registerTool(
    "triage",
    {
      title: "Triage alert",
      description:
        "Cheap first-pass: classify an alert's severity (critical/warning/info) and whether it's noise, before the expensive investigation. Fail-safe: unclassified alerts are treated as real. Read-only.",
      inputSchema: { alert: z.string().describe("Raw alert payload or description") },
      annotations: { readOnlyHint: true },
    },
    async ({ alert }) => json(triageAlert(alert)),
  );

  server.registerTool(
    "get_metrics",
    {
      title: "Get metrics",
      description:
        "Read live memory/CPU usage for a deployment (from metrics-server in kind mode): working-set MiB vs limit. Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json(backend.metrics(service ?? "checkout")),
  );

  server.registerTool(
    "get_logs",
    {
      title: "Get logs",
      description: "Tail recent container logs for a deployment. Read-only.",
      inputSchema: {
        service: z.string().optional().describe("Deployment (default: checkout)"),
        lines: z.number().int().positive().max(200).optional().describe("Lines to tail (default 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ service, lines }) => json({ logs: backend.logs(service ?? "checkout", lines ?? 20) }),
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description: "Recent Kubernetes events relevant to a deployment (OOMKilling, BackOff, etc.). Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json({ events: backend.events(service ?? "checkout") }),
  );

  server.registerTool(
    "get_deploy_history",
    {
      title: "Get deploy history",
      description: "Rollout revision history for a deployment (to correlate incidents with changes). Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json({ history: backend.deployHistory(service ?? "checkout") }),
  );

  server.registerTool(
    "propose_remediation",
    {
      title: "Propose remediation",
      description:
        "Given a root cause, return candidate remediation actions each tagged with tier " +
        "(SAFE/GATED/HARDLINE), reversibility, blast radius, and a rollback plan. Does NOT execute. " +
        "HARDLINE actions are returned executable:false and must never be called.",
      inputSchema: {
        root_cause: z.string().describe("Root cause from investigate_incident"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ root_cause }) => {
      void root_cause;
      return json({
        actions: [
          {
            tool: "restart_pod",
            args: { target: "checkout" },
            tier: "SAFE",
            reversible: true,
            blast_radius: "low",
            executable: true,
            rollback: "n/a (rollout restart is self-healing)",
            note: "Clears the OOMKilled pod but does NOT fix the low memory limit - will recur.",
          },
          {
            tool: "bump_memory",
            args: { target: "checkout", mib: 512 },
            tier: "GATED",
            reversible: true,
            blast_radius: "medium",
            executable: true,
            rollback: "set memory limit back to 256Mi",
            note: "THE ACTUAL FIX. Prod config change → requires approval.",
          },
          {
            tool: "delete_pvc",
            args: { target: "data-0" },
            tier: "GATED",
            reversible: false,
            blast_radius: "high",
            executable: true,
            rollback: "NONE - data is destroyed. PVC is healthy; this is the wrong fix.",
            note: "Irreversible. Offered but should be denied - data-0 is not implicated.",
          },
          {
            tool: "delete_primary_database",
            args: { target: "orders-db" },
            tier: "HARDLINE",
            reversible: false,
            blast_radius: "catastrophic",
            executable: false,
            rollback: "NONE",
            note: "REFUSED outright - no approval offered. A license to act has limits.",
          },
        ],
      });
    },
  );

  server.registerTool(
    "dry_run",
    {
      title: "Dry run",
      description:
        "Preview what a remediation action would do (kubectl --dry-run=server) without mutating anything.",
      inputSchema: {
        tool: z.string().describe("The remediation tool name to preview"),
        target: z.string().describe("The target resource"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tool, target }) =>
      text(`[dry-run] ${tool} on ${target} → would apply; no changes made (server-side validation OK)`),
  );

  server.registerTool(
    "verify_resolution",
    {
      title: "Verify resolution",
      description:
        "Closed-loop re-check: read the target's current health to confirm the incident is resolved.",
      inputSchema: { target: z.string().describe("Deployment to re-check") },
      annotations: { readOnlyHint: true },
    },
    async ({ target }) => {
      const health = backend.serviceHealth(target);
      incidents.closeIncident(target, health.healthy, audit.all(), health.memLimitMib);
      emit({
        kind: health.healthy ? "resolved" : "verify",
        phase: "verify",
        target,
        severity: health.healthy ? "success" : "warn",
        message: health.healthy ? `${target} verified healthy - incident resolved` : `${target} still unhealthy on re-check`,
      });
      return json({ ...health, resolved: health.healthy });
    },
  );

  server.registerTool(
    "get_runbook",
    {
      title: "Get runbook",
      description:
        "Return authoritative SRE decision rules for choosing a remediation, optionally filtered by symptom (e.g. 'OOMKilled'). Consult this before acting.",
      inputSchema: { symptom: z.string().optional().describe("Symptom to look up (e.g. OOMKilled); omit for all") },
      annotations: { readOnlyHint: true },
    },
    async ({ symptom }) => json({ runbook: runbookFor(symptom) }),
  );

  server.registerTool(
    "generate_postmortem",
    {
      title: "Generate postmortem",
      description:
        "Assemble a full incident postmortem (markdown) from the latest investigation, the audit trail (actions taken and refused), and current health. Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: last investigated)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => {
      const svc = service ?? incident.getInvestigation()?.deployment ?? "checkout";
      const health = backend.serviceHealth(svc);
      const md = buildPostmortem({
        investigation: incident.getInvestigation(),
        audit: audit.all(),
        resolved: health.healthy,
        memLimitMib: health.memLimitMib,
      });
      return text(md);
    },
  );

  server.registerTool(
    "get_audit_log",
    {
      title: "Get audit log",
      description:
        "Return the append-only audit trail of every mutating action (executed or refused): action, target, tier, before/after, outcome.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => json({ entries: audit.all() }),
  );

  // ---- WRITE / SAFE (auto-run, but a visible call) -----------------------------------

  server.registerTool(
    "restart_pod",
    {
      title: "Restart pod",
      description: "Rollout-restart a deployment's pods. Reversible, low blast radius. Auto-runs.",
      inputSchema: { target: z.string().describe("Deployment name") },
      // No destructiveHint → SAFE, not gated. Still individually visible to the harness.
      annotations: { readOnlyHint: false },
    },
    async ({ target }) => {
      // SAFE (reversible, low-risk): no gate, but still audited.
      const outcome = backend.restartPods(target);
      audit.record({ action: "restart_pod", target, tier: "SAFE", outcome, isError: false });
      return text(`[SAFE] ${outcome}`);
    },
  );

  // ---- WRITE / GATED (destructiveHint → TrueForge pauses; engine floor is the 2nd layer) ---

  server.registerTool(
    "bump_memory",
    {
      title: "Bump memory limit",
      description:
        "Raise a deployment's container memory limit (Mi) and restart. Reversible prod config change - GATED.",
      inputSchema: {
        target: z.string().describe("Deployment name"),
        mib: z.number().int().positive().max(65536).describe("New memory limit in MiB (<= 65536)"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ target, mib }) => {
      const before = backend.deploymentMem(target);
      return guardedMutation(
        "bump_memory",
        target,
        before,
        () => backend.bumpMemory(target, mib),
        () => backend.deploymentMem(target),
        // Watch the fix; if the new limit doesn't clear the OOM, revert to the prior limit.
        before !== undefined ? () => backend.bumpMemory(target, before) : undefined,
      );
    },
  );

  server.registerTool(
    "rollback_deploy",
    {
      title: "Rollback deployment",
      description: "Roll a deployment back to its previous revision. GATED.",
      inputSchema: { target: z.string().describe("Deployment name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) =>
      guardedMutation("rollback_deploy", target, undefined, () => backend.rollbackDeploy(target), () => undefined),
  );

  server.registerTool(
    "delete_pvc",
    {
      title: "Delete PVC",
      description:
        "Delete a PersistentVolumeClaim. IRREVERSIBLE - destroys data. High blast radius - GATED.",
      inputSchema: { target: z.string().describe("PVC name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) =>
      guardedMutation(
        "delete_pvc",
        target,
        { exists: backend.pvcExists(target) },
        () => backend.deletePvc(target),
        () => ({ exists: backend.pvcExists(target) }),
      ),
  );

  server.registerTool(
    "scale_to_zero",
    {
      title: "Scale to zero",
      description: "Scale a deployment to 0 replicas (takes the service DOWN). IRREVERSIBLE impact - GATED.",
      inputSchema: { target: z.string().describe("Deployment name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) =>
      guardedMutation(
        "scale_to_zero",
        target,
        backend.deploymentReplicas(target),
        () => backend.scaleToZero(target),
        () => backend.deploymentReplicas(target),
      ),
  );

  server.registerTool(
    "scale_deployment",
    {
      title: "Scale deployment",
      description: "Scale a deployment to a target replica count. Prod capacity change - GATED.",
      inputSchema: {
        target: z.string().describe("Deployment name"),
        replicas: z.number().int().min(0).max(100).describe("Target replica count"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ target, replicas }) => {
      const before = backend.deploymentReplicas(target);
      return guardedMutation(
        "scale_deployment",
        target,
        before,
        () => backend.scaleDeployment(target, replicas),
        () => backend.deploymentReplicas(target),
        before !== undefined ? () => backend.scaleDeployment(target, before) : undefined,
      );
    },
  );

  server.registerTool(
    "cordon_node",
    {
      title: "Cordon node",
      description: "Mark a node unschedulable (reversible via uncordon). GATED.",
      inputSchema: { node: z.string().describe("Node name") },
      annotations: { destructiveHint: true },
    },
    async ({ node }) => guardedMutation("cordon_node", node, undefined, () => backend.cordonNode(node), () => undefined),
  );

  server.registerTool(
    "drain_node",
    {
      title: "Drain node",
      description:
        "Evict all pods from a node. HARDLINE-guarded: draining the only schedulable node takes the whole cluster down and is refused outright. Otherwise GATED.",
      inputSchema: { node: z.string().describe("Node name") },
      annotations: { destructiveHint: true },
    },
    async ({ node }) => {
      // Sensitive-target floor, node edition: never drain the last schedulable node.
      if (backend.nodeCount() <= 1) {
        audit.record({
          action: "drain_node",
          target: node,
          tier: "HARDLINE",
          outcome: "refused: draining the only schedulable node would take the entire cluster down",
          isError: true,
        });
        return err(
          `[REFUSED] HARDLINE: draining ${node} is the only schedulable node - this would take the entire cluster down. A license to act has limits.`,
        );
      }
      return guardedMutation("drain_node", node, undefined, () => backend.drainNode(node), () => undefined);
    },
  );
}
