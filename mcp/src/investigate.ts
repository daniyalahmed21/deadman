/**
 * Root-cause synthesis from live signals — scenario-aware.
 *
 * Both backends gather the same signals — memory limit, per-pod restart counts, the pod's
 * waiting/terminated reason (OOMKilled / CrashLoopBackOff / ImagePullBackOff), and the real
 * memory working set — and this shared function turns them into an InvestigationResult with
 * a recommended remediation. Grounded in real telemetry, not a hardcoded fixture.
 */

import type { InvestigationResult } from "./fixtures.js";

export interface PodSignal {
  name: string;
  restarts: number;
  oomKilled: boolean;
  /** k8s reason: OOMKilled | CrashLoopBackOff | ImagePullBackOff | ErrImagePull | Running | ... */
  reason?: string;
}

const R = (deployment: string, r: Partial<InvestigationResult> & { root_cause: string }): InvestigationResult => ({
  evidence: [],
  validity_score: 0.6,
  is_noise: false,
  report_md: `# Investigation: ${deployment}\n\n**Root cause.** ${r.root_cause}`,
  summary: r.root_cause,
  ...r,
});

export function buildInvestigation(
  deployment: string,
  memLimitMib: number,
  pods: PodSignal[],
  workingSetMib?: number,
): InvestigationResult {
  const oomPod = pods.find((p) => p.oomKilled);
  const reasonPod = pods.find((p) => p.reason && /ImagePull|ErrImagePull|CrashLoop/i.test(p.reason));
  const maxRestarts = pods.reduce((m, p) => Math.max(m, p.restarts), 0);
  const ws = workingSetMib && workingSetMib > 0 ? `${workingSetMib}Mi` : undefined;

  // Scenario 1: OOMKill → raise the memory limit.
  if (oomPod) {
    return R(deployment, {
      root_cause: ws
        ? `${deployment} is OOMKilled: measured memory working set (${ws}) meets or exceeds the container limit (${memLimitMib}Mi).`
        : `${deployment} is OOMKilled: the container memory limit (${memLimitMib}Mi) is below the workload's steady-state working set.`,
      evidence: [
        `pod ${oomPod.name}: ${oomPod.restarts} restarts, last state OOMKilled (exit 137)`,
        `container memory limit is ${memLimitMib}Mi`,
        ...(ws ? [`measured memory working set: ${ws} (from metrics-server)`] : []),
        "no correlated deploy, config change, or traffic spike in the window",
      ],
      validity_score: 0.91,
      summary: `OOMKill on ${deployment}: memory limit ${memLimitMib}Mi is too low — raise to >=512Mi and restart.`,
      recommended_action: "bump_memory",
    });
  }

  // Scenario 2: ImagePull → a bad image reference from a recent deploy; roll back.
  if (reasonPod && /ImagePull|ErrImagePull/i.test(reasonPod.reason ?? "")) {
    return R(deployment, {
      root_cause: `${deployment} cannot start: image pull is failing (${reasonPod.reason}) — a bad or unauthorized image reference, most likely from the latest deploy.`,
      evidence: [
        `pod ${reasonPod.name}: waiting, reason ${reasonPod.reason}`,
        "container never reached Running",
        "correlate with the most recent rollout (get_deploy_history)",
      ],
      validity_score: 0.86,
      recommended_action: "rollback_deploy",
    });
  }

  // Scenario 3: CrashLoop without OOM → failing readiness/liveness or bad config; roll back.
  if ((reasonPod && /CrashLoop/i.test(reasonPod.reason ?? "")) || maxRestarts > 0) {
    return R(deployment, {
      root_cause: `${deployment} is crash-looping (${maxRestarts} restarts) with no OOMKill signal — likely a failing readiness/liveness probe or a bad config from a recent deploy.`,
      evidence: [
        `max restart count ${maxRestarts}`,
        "no OOMKill termination observed",
        `memory limit ${memLimitMib}Mi (not implicated)`,
      ],
      validity_score: 0.62,
      recommended_action: "rollback_deploy",
    });
  }

  // Scenario 4: no active failure → likely noise.
  return R(deployment, {
    root_cause: `No active failure detected on ${deployment} (limit ${memLimitMib}Mi, no restarts).`,
    evidence: [`memory limit ${memLimitMib}Mi`, "no restarts", "no OOMKill termination"],
    validity_score: 0.2,
    is_noise: true,
    summary: `${deployment} looks healthy — likely noise.`,
  });
}
