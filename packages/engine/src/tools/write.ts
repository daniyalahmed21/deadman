/** WRITE tools. restart_pod is SAFE (auto-runs, still audited). The rest carry destructiveHint,
 *  so TrueForge pauses for Allow/Deny; guardedMutation adds the engine's sensitive-target floor
 *  and arms the auto-rollback watchdog for fixes. HARDLINE actions are never registered here. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { text, err, guardedMutation } from "./shared.js";
import { backend } from "../backend.js";
import * as audit from "../audit.js";

export function registerWriteTools(server: McpServer): void {
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
      description: "Delete a PersistentVolumeClaim. IRREVERSIBLE - destroys data. High blast radius - GATED.",
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
