/**
 * The agent's remediation plan for the current incident, held for the cockpit: the recalled
 * proven fix, the approval-diff preview, and the sandbox-rehearsal result. Reset when a new
 * investigation opens.
 */

import type { Insights } from "@deadman/shared";

const empty = (): Insights => ({ recommendedAction: null, recall: null, preview: null, rehearsal: null });

let current: Insights = empty();

export function setInsights(patch: Partial<Insights>): void {
  current = { ...current, ...patch };
}

export function getInsights(): Insights {
  return current;
}

export function resetInsights(): void {
  current = empty();
}
