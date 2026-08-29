/**
 * Cluster backend selection.
 *
 * The remediation tools talk to a `ClusterBackend`, never to kubectl or the sim directly.
 * Two implementations:
 *   - sim  (default): deterministic in-memory cluster - bulletproof for recording.
 *   - kind (DEADMAN_CLUSTER=kind): real kubectl against a local kind cluster - real work.
 *
 * Same interface both ways, so the tool signatures never change.
 */

import * as sim from "./cluster.js";
import { kindBackend } from "./backends/kind.js";
import { buildInvestigation } from "./investigate.js";
import type { InvestigationResult } from "./fixtures.js";
import type { ChangeEvent, RehearsalResult } from "@deadman/shared";
import { demoMode } from "./config.js";

export interface HealthSnapshot {
  deployment: string;
  healthy: boolean;
  memLimitMib: number;
  replicas: number;
  pods: { name: string; phase: string; restarts: number }[];
}

export interface PodMetric {
  name: string;
  memMib: number;
  cpuMillis: number;
}
export interface Metrics {
  workingSetMib: number;
  cpuMillis: number;
  pods: PodMetric[];
}

/** The field(s) a preview/rehearsal would change, expressed as intent (not a kubectl object). */
export interface RemediationPatch {
  /** new memory limit in MiB (bump_memory) */
  mib?: number;
  /** target replica count (scale_deployment) */
  replicas?: number;
}

/** A real change preview: the field diff and any admission/quota warnings. */
export interface PreviewProbe {
  rawDiff: string;
  warnings: string[];
}

export interface ClusterBackend {
  readonly mode: "sim" | "kind";
  reset(): void;
  investigate(deployment: string): InvestigationResult;
  serviceHealth(deployment: string): HealthSnapshot;
  metrics(deployment: string): Metrics;
  logs(deployment: string, lines: number): string[];
  /** Logs from the PREVIOUS (crashed) container - where a CrashLoop/OOMKill death signal lives. */
  previousLogs(deployment: string, lines: number): string[];
  /** `kubectl describe pod`-style summary: status, restarts, last-state/exit, conditions, events. */
  describePod(deployment: string): string;
  events(deployment: string): string[];
  deployHistory(deployment: string): string[];
  /** Structured recent-change history, for change-correlation. */
  changeHistory(deployment: string): ChangeEvent[];
  deploymentMem(deployment: string): number | undefined;
  deploymentReplicas(deployment: string): number | undefined;
  pvcExists(name: string): boolean;
  restartPods(deployment: string): string;
  bumpMemory(deployment: string, mib: number): string;
  rollbackDeploy(deployment: string): string;
  deletePvc(name: string): string;
  scaleToZero(deployment: string): string;
  scaleDeployment(deployment: string, replicas: number): string;
  cordonNode(node: string): string;
  drainNode(node: string): string;
  /** Number of schedulable (Ready) nodes - used to refuse draining the last one. */
  nodeCount(): number;
  /**
   * Real change preview for `patch`: a real `kubectl diff`, real admission warnings from a
   * server dry-run, and a live ResourceQuota headroom check. Optional: only the kind backend has
   * a cluster to dry-run against; the sim returns its templated preview unchanged.
   */
  previewChange?(deployment: string, patch: RemediationPatch): PreviewProbe;
  /**
   * Rehearse `action` before it touches prod, and report whether it resolves the incident. The
   * sim forks its in-memory state; kind clones the deployment into a throwaway namespace and
   * watches it under real cgroup enforcement (memory case, idle load only).
   */
  rehearse(action: string, target: string, args: RemediationPatch): RehearsalResult;
}

const simBackend: ClusterBackend = {
  mode: "sim",
  reset: () => sim.resetCluster(),
  investigate: (d) => {
    const h = sim.snapshotHealth(d);
    const pods = h.pods.map((p) => ({
      name: p.name,
      restarts: p.restarts,
      oomKilled: /OOMKilled/i.test(p.phase),
      reason: p.reason,
    }));
    return buildInvestigation(d, h.memLimitMib, pods, sim.podMetricsSim(d).workingSetMib);
  },
  serviceHealth: (d) => sim.snapshotHealth(d),
  metrics: (d) => sim.podMetricsSim(d),
  logs: (d, n) => sim.podLogsSim(d, n),
  previousLogs: (d, n) => sim.podPreviousLogsSim(d, n),
  describePod: (d) => sim.describePodSim(d),
  events: (d) => sim.clusterEventsSim(d),
  deployHistory: (d) => sim.deployHistorySim(d),
  changeHistory: (d) => sim.changeHistorySim(d),
  deploymentMem: (d) => sim.getDeployment(d)?.memLimitMib,
  deploymentReplicas: (d) => sim.getDeployment(d)?.replicas,
  pvcExists: (n) => sim.pvcExists(n),
  restartPods: (d) => sim.restartPods(d),
  bumpMemory: (d, m) => sim.bumpMemory(d, m),
  rollbackDeploy: (d) => sim.rollbackDeploy(d),
  deletePvc: (n) => sim.deletePvc(n),
  scaleToZero: (d) => sim.scaleToZero(d),
  scaleDeployment: (d, r) => sim.scaleDeploymentSim(d, r),
  cordonNode: (n) => sim.cordonNodeSim(n),
  drainNode: (n) => sim.drainNodeSim(n),
  nodeCount: () => 1, // kind is single-node; the sim models the same so drain-last-node is refused
  rehearse: (action, target, args) => sim.rehearseSim(action, target, args),
};

// Demo mode forces the deterministic sim backend regardless of DEADMAN_CLUSTER.
export const backend: ClusterBackend =
  !demoMode() && process.env.DEADMAN_CLUSTER === "kind" ? kindBackend : simBackend;
