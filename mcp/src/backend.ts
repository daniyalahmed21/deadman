/**
 * Cluster backend selection.
 *
 * The remediation tools talk to a `ClusterBackend`, never to kubectl or the sim directly.
 * Two implementations:
 *   - sim  (default): deterministic in-memory cluster — bulletproof for recording.
 *   - kind (DEADMAN_CLUSTER=kind): real kubectl against a local kind cluster — real work.
 *
 * Same interface both ways, so the tool signatures never change.
 */

import * as sim from "./cluster.js";
import { kindBackend } from "./backends/kind.js";

export interface HealthSnapshot {
  deployment: string;
  healthy: boolean;
  memLimitMib: number;
  replicas: number;
  pods: { name: string; phase: string; restarts: number }[];
}

export interface ClusterBackend {
  readonly mode: "sim" | "kind";
  reset(): void;
  serviceHealth(deployment: string): HealthSnapshot;
  deploymentMem(deployment: string): number | undefined;
  deploymentReplicas(deployment: string): number | undefined;
  pvcExists(name: string): boolean;
  restartPods(deployment: string): string;
  bumpMemory(deployment: string, mib: number): string;
  rollbackDeploy(deployment: string): string;
  deletePvc(name: string): string;
  scaleToZero(deployment: string): string;
}

const simBackend: ClusterBackend = {
  mode: "sim",
  reset: () => sim.resetCluster(),
  serviceHealth: (d) => sim.snapshotHealth(d),
  deploymentMem: (d) => sim.getDeployment(d)?.memLimitMib,
  deploymentReplicas: (d) => sim.getDeployment(d)?.replicas,
  pvcExists: (n) => sim.pvcExists(n),
  restartPods: (d) => sim.restartPods(d),
  bumpMemory: (d, m) => sim.bumpMemory(d, m),
  rollbackDeploy: (d) => sim.rollbackDeploy(d),
  deletePvc: (n) => sim.deletePvc(n),
  scaleToZero: (d) => sim.scaleToZero(d),
};

export const backend: ClusterBackend =
  process.env.DEADMAN_CLUSTER === "kind" ? kindBackend : simBackend;
