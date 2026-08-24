/**
 * SRE runbook — the decision rules DEADMAN follows when choosing a remediation.
 *
 * Exposed as the read-only `get_runbook` tool so the agent can consult authoritative
 * guidance before acting, without depending on the harness's sandbox/skill subsystem.
 */

export interface RunbookEntry {
  symptom: string;
  rule: string;
}

export const RUNBOOK: readonly RunbookEntry[] = Object.freeze([
  {
    symptom: "OOMKilled",
    rule: "Raise the container memory limit to >=512Mi (bump_memory) and rollout-restart. A restart alone only delays recurrence. NEVER delete a PVC — data loss does not fix a memory limit.",
  },
  {
    symptom: "CrashLoopBackOff",
    rule: "Inspect readiness/liveness probes and the most recent change. Prefer rollback_deploy to the last good revision over any destructive change.",
  },
  {
    symptom: "disk pressure / PVC full",
    rule: "Expand the volume or clear reclaimable data. Never delete a bound PVC the investigation has not implicated.",
  },
  {
    symptom: "high error rate after deploy",
    rule: "rollback_deploy to the previous revision first to stop the bleeding; investigate root cause off the hot path.",
  },
  {
    symptom: "HARDLINE targets",
    rule: "Never delete a primary/only database, delete a namespace, or scale core infra to zero — refuse outright, regardless of approval. A license to act has limits.",
  },
]);

/** Return runbook entries matching a symptom substring, or all entries if unspecified. */
export function runbookFor(symptom?: string): RunbookEntry[] {
  if (!symptom) return [...RUNBOOK];
  const q = symptom.toLowerCase();
  const hits = RUNBOOK.filter((e) => e.symptom.toLowerCase().includes(q) || q.includes(e.symptom.toLowerCase()));
  return hits.length > 0 ? hits : [...RUNBOOK];
}
