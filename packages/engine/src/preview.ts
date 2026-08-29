/**
 * Remediation preview - the "approve with full context" payload for the human-approval gate.
 * For a proposed action it computes WHAT changes (a structured field delta + a raw-diff receipt),
 * the BLAST RADIUS (pods affected, disruption, reversibility, a severity badge), and the ROLLBACK
 * plan (the inverse + captured before-state). Read-only: it reads live state and mutates nothing.
 *
 * The sim computes a deterministic, coherent preview; on kind the backend populates `rawDiff`
 * from a real `kubectl diff` and `warnings` from a server dry-run plus a quota headroom check.
 */

import { backend, type RemediationPatch } from "./backend.js";
import { classifyTool } from "./classifier.js";
import type { BlastRadius, RemediationPreview } from "@deadman/shared";

/** Severity from the blast shape: stateful/irreversible/downtime = high; pod-disrupting = medium. */
function severity(b: Pick<BlastRadius, "stateful" | "reversible" | "disruption" | "podsAffected">): BlastRadius["severity"] {
  if (b.stateful || !b.reversible || b.disruption === "downtime") return "high";
  if (b.podsAffected > 0 && (b.disruption === "rolling" || b.disruption === "restart")) return "medium";
  return "low";
}

/**
 * On a real cluster, replace the templated diff and warnings with a REAL server dry-run + kubectl
 * diff. On the sim (no `previewChange`), the templated preview is returned unchanged.
 */
function withRealPreview(result: RemediationPreview, deployment: string, patch: RemediationPatch): RemediationPreview {
  const probe = backend.previewChange?.(deployment, patch);
  if (!probe) return result;
  return { ...result, rawDiff: probe.rawDiff || result.rawDiff, warnings: [...result.warnings, ...probe.warnings] };
}

export function previewRemediation(action: string, target: string, args: { mib?: number; replicas?: number } = {}): RemediationPreview {
  const tier = classifyTool(action);
  const replicas = backend.deploymentReplicas(target) ?? 0;
  const base = { action, target, tier, warnings: [] as string[] };

  switch (action) {
    case "bump_memory": {
      const before = backend.deploymentMem(target) ?? 0;
      const after = args.mib ?? before;
      const blast: BlastRadius = { podsAffected: replicas, disruption: "rolling", stateful: false, reversible: true, severity: "low" };
      blast.severity = severity(blast);
      return withRealPreview(
        {
          ...base,
          summary: `Raise ${target} memory limit ${before}Mi -> ${after}Mi (rolling restart, ${replicas} pods)`,
          changes: [{ path: "spec.template.spec.containers[0].resources.limits.memory", before: `${before}Mi`, after: `${after}Mi` }],
          rawDiff: `  containers:\n-     memory: ${before}Mi\n+     memory: ${after}Mi`,
          blastRadius: blast,
          rollback: { method: "re-apply previous limit", inverse: `bump_memory ${target} ${before}`, beforeState: { memory: `${before}Mi` }, note: "reversible prod config change" },
          destructive: true,
        },
        target,
        { mib: after },
      );
    }
    case "delete_pvc": {
      const blast: BlastRadius = { podsAffected: 0, disruption: "none", stateful: true, reversible: false, severity: "high" };
      return {
        ...base,
        summary: `Delete PVC ${target} - IRREVERSIBLE, destroys the volume's data`,
        changes: [{ path: `pvc/${target}`, before: "Bound", after: "Deleted" }],
        rawDiff: `- PersistentVolumeClaim/${target}   (Bound -> Deleted)`,
        blastRadius: blast,
        rollback: null,
        warnings: ["Irreversible: the data is destroyed. A rollback restores the manifest, not the data."],
        destructive: true,
      };
    }
    case "rollback_deploy": {
      const blast: BlastRadius = { podsAffected: replicas, disruption: "rolling", stateful: false, reversible: true, severity: "low" };
      blast.severity = severity(blast);
      return {
        ...base,
        summary: `Roll ${target} back to the previous revision (rolling, ${replicas} pods)`,
        changes: [{ path: "spec.template", before: "current revision", after: "previous revision" }],
        rawDiff: `~ Deployment/${target}   rollout undo -> previous revision`,
        blastRadius: blast,
        rollback: { method: "roll forward", inverse: `rollout undo ${target}`, beforeState: { revision: "current" }, note: "reversible - roll forward to redo" },
        destructive: true,
      };
    }
    case "restart_pod": {
      const blast: BlastRadius = { podsAffected: replicas, disruption: "restart", stateful: false, reversible: true, severity: "low" };
      blast.severity = severity(blast);
      return {
        ...base,
        summary: `Rollout-restart ${target} (${replicas} pods) - clears the symptom, not the cause`,
        changes: [{ path: "pods", before: "Running", after: "Recreated" }],
        rawDiff: `~ Deployment/${target}   rollout restart`,
        blastRadius: blast,
        rollback: { method: "n/a", inverse: "self-healing", beforeState: {}, note: "restart is idempotent" },
        warnings: ["Clears the symptom but not the root cause - the incident will recur."],
        destructive: false,
      };
    }
    case "scale_deployment": {
      const to = args.replicas ?? replicas;
      const down = to < replicas;
      const blast: BlastRadius = { podsAffected: Math.abs(to - replicas), disruption: to === 0 ? "downtime" : "rolling", stateful: false, reversible: true, severity: "low" };
      blast.severity = severity(blast);
      return withRealPreview(
        {
          ...base,
          summary: `Scale ${target} ${replicas} -> ${to} replicas`,
          changes: [{ path: "spec.replicas", before: replicas, after: to }],
          rawDiff: `-   replicas: ${replicas}\n+   replicas: ${to}`,
          blastRadius: blast,
          rollback: { method: "scale back", inverse: `scale_deployment ${target} ${replicas}`, beforeState: { replicas }, note: down ? "scaling down reduces capacity" : "reversible" },
          warnings: to === 0 ? ["Scales to zero - the service goes DOWN."] : [],
          destructive: true,
        },
        target,
        { replicas: to },
      );
    }
    default: {
      const blast: BlastRadius = { podsAffected: 0, disruption: "none", stateful: false, reversible: true, severity: "low" };
      return { ...base, summary: `No preview model for ${action}`, changes: [], rawDiff: "", blastRadius: blast, rollback: null, warnings: [`No preview for ${action}`], destructive: true };
    }
  }
}
