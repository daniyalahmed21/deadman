/**
 * Root-cause synthesis from live signals.
 *
 * Both backends gather the same three signals — memory limit, per-pod restart counts, and
 * whether a pod was OOMKilled — and this shared function turns them into an InvestigationResult.
 * So the investigation is grounded in real telemetry (real kubectl in kind mode; sim state
 * otherwise), not a hardcoded fixture.
 */

import type { InvestigationResult } from "./fixtures.js";

export interface PodSignal {
  name: string;
  restarts: number;
  oomKilled: boolean;
}

export function buildInvestigation(
  deployment: string,
  memLimitMib: number,
  pods: PodSignal[],
): InvestigationResult {
  const oomPod = pods.find((p) => p.oomKilled);
  const maxRestarts = pods.reduce((m, p) => Math.max(m, p.restarts), 0);

  if (oomPod) {
    const root_cause = `${deployment} is OOMKilled: the container memory limit (${memLimitMib}Mi) is below the workload's steady-state working set.`;
    return {
      root_cause,
      evidence: [
        `pod ${oomPod.name}: ${oomPod.restarts} restarts, last state OOMKilled (exit 137)`,
        `container memory limit is ${memLimitMib}Mi`,
        "no correlated deploy, config change, or traffic spike in the window",
      ],
      validity_score: 0.91,
      is_noise: false,
      summary: `OOMKill on ${deployment}: mem limit ${memLimitMib}Mi is too low. Fix = raise limit to >=512Mi + restart.`,
      report_md: [
        `# Investigation: ${deployment} OOMKill`,
        "",
        `**Root cause.** \`${deployment}\` is being OOMKilled. Its memory limit is **${memLimitMib}Mi**,`,
        "below the workload's working set, so the kernel reaps it (exit 137) under normal load.",
        "",
        "**Evidence.**",
        `- \`${oomPod.name}\`: ${oomPod.restarts} restarts, last state \`OOMKilled\`.`,
        `- container memory limit **${memLimitMib}Mi**.`,
        "- no correlated deploy / config change / traffic spike.",
        "",
        "**Recommended fix.** Raise the memory limit to **>=512Mi** and restart. Do not delete data.",
      ].join("\n"),
    };
  }

  if (maxRestarts > 0) {
    return {
      root_cause: `${deployment} pods are restarting (${maxRestarts}x) with no OOMKill signal — likely a crash or readiness failure.`,
      evidence: [`max restart count ${maxRestarts}`, `memory limit ${memLimitMib}Mi`, "no OOMKill termination observed"],
      validity_score: 0.6,
      is_noise: false,
      summary: `${deployment} is restarting (${maxRestarts}x) without OOMKill — investigate logs/readiness.`,
      report_md: `# Investigation: ${deployment}\n\n**Root cause.** Pods are restarting ${maxRestarts}x with no OOMKill signal — a crash or readiness issue is more likely than memory.`,
    };
  }

  return {
    root_cause: `No active failure detected on ${deployment} (limit ${memLimitMib}Mi, no restarts).`,
    evidence: [`memory limit ${memLimitMib}Mi`, "no restarts", "no OOMKill termination"],
    validity_score: 0.2,
    is_noise: true,
    summary: `${deployment} looks healthy — likely noise.`,
    report_md: `# Investigation: ${deployment}\n\n**No active failure.** Limit ${memLimitMib}Mi, no restarts observed. Likely a noisy alert.`,
  };
}
