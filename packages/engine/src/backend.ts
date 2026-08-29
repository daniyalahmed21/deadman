/**
 * Cluster backend.
 *
 * The remediation tools talk to a `ClusterBackend`, never to kubectl directly. There is one
 * implementation: `kind`, which shells out to `kubectl` against a real cluster (a local kind
 * cluster in dev, any EKS/GKE/AKS context in production - see backends/kind.ts). DEADMAN only
 * ever acts on real infrastructure; the interface is the seam that keeps the tools kubectl-free.
 */

import { kindBackend } from "./backends/kind.js";
import type { InvestigationResult } from "./fixtures.js";
import type { ChangeEvent, RehearsalResult } from "@deadman/shared";

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
  readonly mode: "kind";
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
   * server dry-run, and a live ResourceQuota headroom check against the cluster.
   */
  previewChange?(deployment: string, patch: RemediationPatch): PreviewProbe;
  /**
   * Rehearse `action` before it touches prod, and report whether it resolves the incident. Clones
   * the deployment into a throwaway namespace and watches it under real cgroup enforcement
   * (memory case, idle load only), then tears the namespace down.
   */
  rehearse(action: string, target: string, args: RemediationPatch): RehearsalResult;
}

// The engine drives a real cluster only. `kind` locally, any EKS/GKE/AKS context in production
// (see backends/kind.ts). There is no in-memory backend; DEADMAN acts on real infrastructure.
export const backend: ClusterBackend = kindBackend;
