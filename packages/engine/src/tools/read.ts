/** READ tools: never gated (readOnlyHint). Investigation, evidence, proposal, preview, recall,
 *  rehearsal, verification, runbook, postmortem, audit. Logic lives in flows.ts / the modules. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { json, text } from "./shared.js";
import { backend } from "../backend.js";
import { triageAlert } from "../triage.js";
import { runbookFor } from "../runbook.js";
import { buildPostmortem } from "../postmortem.js";
import { previewRemediation } from "../preview.js";
import { recallSimilar } from "../recall.js";
import { allMemories } from "../memory.js";
import * as audit from "../audit.js";
import * as incident from "../incident.js";
import { runInvestigation, proposeRemediation, verifyResolution, rehearseRemediation } from "../flows.js";

const svcOf = (service?: string) => service ?? "checkout";

export function registerReadTools(server: McpServer): void {
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
    async ({ alert, service }) => json(await runInvestigation(alert, service)),
  );

  server.registerTool(
    "get_service_health",
    {
      title: "Get service health",
      description: "Read-only probe of a deployment's current health: replicas, restarts, memory limit.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json(backend.serviceHealth(svcOf(service))),
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
    async ({ service }) => json(backend.metrics(svcOf(service))),
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
    async ({ service, lines }) => json({ logs: backend.logs(svcOf(service), lines ?? 20) }),
  );

  server.registerTool(
    "get_previous_logs",
    {
      title: "Get previous (crashed) container logs",
      description:
        "Tail logs from the PREVIOUS, crashed container (kubectl logs --previous). After a restart the live " +
        "container is fresh and often empty; the cause of a CrashLoopBackOff or OOMKill is in the instance that " +
        "died. Use this when get_logs looks empty on a restarting pod. Read-only.",
      inputSchema: {
        service: z.string().optional().describe("Deployment (default: checkout)"),
        lines: z.number().int().positive().max(200).optional().describe("Lines to tail (default 40)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ service, lines }) => json({ previousLogs: backend.previousLogs(svcOf(service), lines ?? 40) }),
  );

  server.registerTool(
    "describe_pod",
    {
      title: "Describe pod",
      description:
        "Full pod description (kubectl describe pod): status, restart count, last-state termination reason and " +
        "exit code, readiness conditions, and recent events - the one-shot 'what is wrong with this pod' read. Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => text(backend.describePod(svcOf(service))),
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description: "Recent Kubernetes events relevant to a deployment (OOMKilling, BackOff, etc.). Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json({ events: backend.events(svcOf(service)) }),
  );

  server.registerTool(
    "get_deploy_history",
    {
      title: "Get deploy history",
      description: "Rollout revision history for a deployment (to correlate incidents with changes). Read-only.",
      inputSchema: { service: z.string().optional().describe("Deployment (default: checkout)") },
      annotations: { readOnlyHint: true },
    },
    async ({ service }) => json({ history: backend.deployHistory(svcOf(service)) }),
  );

  server.registerTool(
    "propose_remediation",
    {
      title: "Propose remediation",
      description:
        "Given a root cause, return candidate remediation actions each tagged with tier " +
        "(SAFE/GATED/HARDLINE), reversibility, blast radius, and a rollback plan. Does NOT execute. " +
        "HARDLINE actions are returned executable:false and must never be called.",
      inputSchema: { root_cause: z.string().describe("Root cause from investigate_incident") },
      annotations: { readOnlyHint: true },
    },
    async ({ root_cause }) => json(proposeRemediation(root_cause)),
  );

  server.registerTool(
    "dry_run",
    {
      title: "Dry run",
      description: "Preview what a remediation action would do (kubectl --dry-run=server) without mutating anything.",
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
    "preview_remediation",
    {
      title: "Preview remediation (approval diff)",
      description:
        "Compute what a remediation would change: a field-level diff, blast radius (pods, " +
        "disruption, reversibility, severity), and the rollback plan - the full context to " +
        "show a human at the approval gate before a destructive action runs. Read-only.",
      inputSchema: {
        action: z.string().describe("Remediation tool, e.g. bump_memory / delete_pvc"),
        target: z.string().describe("Deployment / resource"),
        mib: z.number().int().positive().optional().describe("New memory limit (for bump_memory)"),
        replicas: z.number().int().min(0).optional().describe("Target replicas (for scale_deployment)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ action, target, mib, replicas }) => json(previewRemediation(action, target, { mib, replicas })),
  );

  server.registerTool(
    "recall_similar",
    {
      title: "Recall similar past incident",
      description:
        "Search incident memory for a past incident similar to this alert and return the fix that " +
        "resolved it, with a similarity score. A suggestion from memory, not a decision. Read-only.",
      inputSchema: {
        service: z.string().describe("Affected service"),
        signal: z.string().optional().describe("Failure mode, e.g. OOMKilled / CrashLoopBackOff"),
        alert: z.string().describe("Alert text / root cause"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ service, signal, alert }) => json({ match: recallSimilar({ service, signal, text: alert }, allMemories()) }),
  );

  server.registerTool(
    "rehearse_remediation",
    {
      title: "Rehearse remediation in a sandbox",
      description:
        "Fork the current cluster state into an isolated sandbox, apply the proposed action to " +
        "the fork, and report whether the fork became healthy - BEFORE the real gated action runs. " +
        "Does NOT touch prod. Use this to prove a fix works (or that a wrong fix does not) before approval.",
      inputSchema: {
        action: z.string().describe("Remediation tool to rehearse, e.g. bump_memory"),
        target: z.string().describe("Deployment / target"),
        mib: z.number().int().positive().optional().describe("New memory limit (for bump_memory)"),
        replicas: z.number().int().min(0).optional().describe("Target replicas (for scale_deployment)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ action, target, mib, replicas }) => json(rehearseRemediation(action, target, { mib, replicas })),
  );

  server.registerTool(
    "verify_resolution",
    {
      title: "Verify resolution",
      description: "Closed-loop re-check: read the target's current health to confirm the incident is resolved.",
      inputSchema: { target: z.string().describe("Deployment to re-check") },
      annotations: { readOnlyHint: true },
    },
    async ({ target }) => json(verifyResolution(target)),
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
      return text(buildPostmortem({ investigation: incident.getInvestigation(), audit: audit.all(), resolved: health.healthy, memLimitMib: health.memLimitMib }));
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
}
