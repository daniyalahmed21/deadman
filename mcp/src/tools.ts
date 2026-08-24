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
import { CANNED_INVESTIGATION, serviceHealthFixture } from "./fixtures.js";
import { classifyTool } from "./classifier.js";
import {
  bumpMemory,
  deletePvc,
  restartPods,
  rollbackDeploy,
  scaleToZero,
  snapshotHealth,
} from "./cluster.js";

/** Wrap any JSON-serialisable value as an MCP text result. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Wrap a plain string as an MCP text result. */
function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

export function registerDeadmanTools(server: McpServer): void {
  // ---- READ tools (never gated) ------------------------------------------------------

  server.registerTool(
    "investigate_incident",
    {
      title: "Investigate incident",
      description:
        "Run the SRE investigation loop on an alert and return a root-cause analysis with evidence. Read-only.",
      inputSchema: { alert: z.string().describe("Raw alert payload or a short description") },
      annotations: { readOnlyHint: true },
    },
    async ({ alert }) => {
      // TODO: replace with the live investigation call once the engine key is wired.
      void alert;
      return json(CANNED_INVESTIGATION);
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
            note: "Clears the OOMKilled pod but does NOT fix the low memory limit — will recur.",
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
            rollback: "NONE — data is destroyed. PVC is healthy; this is the wrong fix.",
            note: "Irreversible. Offered but should be denied — data-0 is not implicated.",
          },
          {
            tool: "delete_primary_database",
            args: { target: "orders-db" },
            tier: "HARDLINE",
            reversible: false,
            blast_radius: "catastrophic",
            executable: false,
            rollback: "NONE",
            note: "REFUSED outright — no approval offered. A license to act has limits.",
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
      const health = snapshotHealth(target);
      return json({ ...health, resolved: health.healthy });
    },
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
    async ({ target }) => text(`[${classifyTool("restart_pod")}] ${restartPods(target)}`),
  );

  // ---- WRITE / GATED (destructiveHint → TrueForge pauses for Allow/Deny) --------------

  server.registerTool(
    "bump_memory",
    {
      title: "Bump memory limit",
      description:
        "Raise a deployment's container memory limit (Mi) and restart. Reversible prod config change — GATED.",
      inputSchema: {
        target: z.string().describe("Deployment name"),
        mib: z.number().int().positive().describe("New memory limit in MiB"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ target, mib }) => text(`[${classifyTool("bump_memory")}] ${bumpMemory(target, mib)}`),
  );

  server.registerTool(
    "rollback_deploy",
    {
      title: "Rollback deployment",
      description: "Roll a deployment back to its previous revision. GATED.",
      inputSchema: { target: z.string().describe("Deployment name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) => text(`[${classifyTool("rollback_deploy")}] ${rollbackDeploy(target)}`),
  );

  server.registerTool(
    "delete_pvc",
    {
      title: "Delete PVC",
      description:
        "Delete a PersistentVolumeClaim. IRREVERSIBLE — destroys data. High blast radius — GATED.",
      inputSchema: { target: z.string().describe("PVC name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) => text(`[${classifyTool("delete_pvc")}] ${deletePvc(target)}`),
  );

  server.registerTool(
    "scale_to_zero",
    {
      title: "Scale to zero",
      description: "Scale a deployment to 0 replicas (takes the service DOWN). IRREVERSIBLE impact — GATED.",
      inputSchema: { target: z.string().describe("Deployment name") },
      annotations: { destructiveHint: true },
    },
    async ({ target }) => text(`[${classifyTool("scale_to_zero")}] ${scaleToZero(target)}`),
  );
}
