/**
 * Build the agent's remediation plan for the recommended fix: recall a proven fix from memory,
 * preview what it changes (diff + blast radius + rollback), and rehearse it in a sandbox to prove
 * it resolves the incident. Stored as `insights` for the cockpit. All read-only (rehearse forks
 * and restores), so this is safe to run at investigation time.
 */

import { symptomOf, type Symptom } from "./correlate.js";
import { recallSimilar } from "./recall.js";
import { allMemories } from "./memory.js";
import { previewRemediation } from "./preview.js";
import { rehearse } from "./rehearse.js";
import { setInsights, resetInsights } from "./insights.js";

const SIGNAL_LABEL: Record<string, string> = { oom: "OOMKilled", imagepull: "ImagePullBackOff", crashloop: "CrashLoopBackOff" };

/** The recommended remediation for a symptom class. */
export function recommendedFix(symptom: Symptom): { action: string; args: { mib?: number; replicas?: number } } | null {
  switch (symptom) {
    case "oom":
      return { action: "bump_memory", args: { mib: 512 } };
    case "crashloop":
    case "imagepull":
      return { action: "rollback_deploy", args: {} };
    default:
      return null;
  }
}

/** Compute recall + preview + rehearsal for the recommended fix and store them as insights. */
export function buildRemediationPlan(service: string, rootCause: string): void {
  const symptom = symptomOf(rootCause);
  const fix = recommendedFix(symptom);
  if (!fix) {
    resetInsights();
    return;
  }
  const recall = recallSimilar({ service, signal: SIGNAL_LABEL[symptom], text: rootCause }, allMemories());
  const preview = previewRemediation(fix.action, service, fix.args);
  const rehearsal = rehearse(fix.action, service, fix.args);
  setInsights({ recommendedAction: fix.action, recall, preview, rehearsal });
}
