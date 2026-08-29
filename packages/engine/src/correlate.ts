/**
 * Change-correlation. Most incidents follow a change, so the first triage question a real SRE
 * asks is "what shipped right before this?" This scores each recent change by temporal proximity
 * to the incident AND causal plausibility (does this change *type* explain *this* symptom), then
 * names the most likely suspect - never claiming causation, only a ranked, explainable suspicion.
 *
 * Two small lookup tables, no ML. Pure and unit-testable.
 */

import type { ChangeEvent, ChangeCorrelation } from "@deadman/shared";

export type Symptom = "oom" | "imagepull" | "crashloop" | "none";

/** Derive a coarse symptom class from an investigation's root-cause text. */
export function symptomOf(rootCause: string): Symptom {
  const t = rootCause.toLowerCase();
  if (/oomkill|out of memory|exit 137/.test(t)) return "oom";
  if (/imagepull|image pull|bad image|pull is failing/.test(t)) return "imagepull";
  if (/crashloop|crash-loop|restart/.test(t)) return "crashloop";
  return "none";
}

/** Recency decay: a change minutes before onset is far more suspicious than one hours before. */
function proximity(dtMin: number): number {
  if (dtMin < 0) return 0; // a change after onset cannot have caused it
  if (dtMin <= 5) return 1;
  if (dtMin <= 15) return 0.8;
  if (dtMin <= 60) return 0.5;
  if (dtMin <= 360) return 0.25;
  return 0.1;
}

/** Does this change type mechanistically explain this symptom? Guards against pure recency. */
function plausibility(c: ChangeEvent, symptom: Symptom, curMemMib: number): number {
  if (symptom === "oom") {
    if (c.kind !== "mem_limit") return 0.2;
    // a memory-limit *decrease* is the causal gold. Prefer the change's own before/after; else
    // fall back to "did it set the limit to the current (low) value that is now OOMing".
    const decreased =
      c.previousMemLimitMib !== undefined && c.memLimitMib !== undefined
        ? c.memLimitMib < c.previousMemLimitMib
        : (c.memLimitMib ?? Infinity) <= curMemMib;
    return decreased ? 1 : 0.3;
  }
  if (symptom === "imagepull") return c.kind === "image" ? 0.9 : 0.3;
  if (symptom === "crashloop") return c.kind === "image" ? 0.9 : c.kind === "deploy" ? 0.7 : 0.3;
  return 0.15;
}

const MIN_SCORE = 0.15;

/** Rank recent changes; return the top suspect (or none) with an honest, hedged reason. */
export function correlateChange(
  changes: ChangeEvent[],
  incidentStart: number,
  symptom: Symptom,
  curMemMib: number,
): ChangeCorrelation {
  const candidates = changes
    .map((change) => ({
      change,
      score: Number((proximity((incidentStart - change.at) / 60000) * plausibility(change, symptom, curMemMib)).toFixed(2)),
    }))
    .sort((a, b) => b.score - a.score);

  const top = candidates[0];
  if (!top || top.score < MIN_SCORE) {
    return {
      suspected: null,
      confidence: 0,
      minutesBefore: null,
      reason: "No recent change plausibly explains this incident.",
      candidates,
    };
  }
  const minutesBefore = Math.round((incidentStart - top.change.at) / 60000);
  return {
    suspected: top.change,
    confidence: top.score,
    minutesBefore,
    candidates,
    reason: `Most likely suspect: revision ${top.change.revision} (${top.change.summary}) ~${minutesBefore}m before onset - a plausible cause of the ${symptom.toUpperCase()}.`,
  };
}
