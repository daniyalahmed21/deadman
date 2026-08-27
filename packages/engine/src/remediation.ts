/**
 * Guarded remediation helpers shared by the demo seeder and the live demo orchestrator.
 * Both run mutations through the same classifier + sensitive-target floor + audit path the
 * real MCP tools use, so seeded/orchestrated runs are genuine - not faked - and every call
 * lands on the audit trail (which in turn emits a live event).
 */

import { classifyTool } from "./classifier.js";
import { guardDestructive } from "./guard.js";
import * as audit from "./audit.js";

/** SAFE mutation: audited, never gated. */
export function safeAction(tool: string, target: string, run: () => string): void {
  audit.record({ action: tool, target, tier: classifyTool(tool), outcome: run(), isError: false });
}

/** GATED mutation through the sensitive-target floor; a refusal is audited and never mutates. */
export function gatedAction(tool: string, target: string, run: () => string): void {
  const tier = classifyTool(tool);
  const verdict = guardDestructive(tool, target);
  if (!verdict.allowed) {
    audit.record({ action: tool, target, tier, outcome: verdict.reason ?? "refused", isError: true });
    return;
  }
  audit.record({ action: tool, target, tier, outcome: run(), isError: false });
}
