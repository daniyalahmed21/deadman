/**
 * Blast-radius classifier — a three-tier, fail-closed model.
 *
 * Three tiers:
 *   SAFE      — reversible, low blast radius → auto-run, no approval.
 *   GATED     — destructive/irreversible → TrueForge pauses for Allow/Deny.
 *   HARDLINE  — catastrophic, no recovery path → REFUSED outright. Never exposed as a
 *               callable tool; `propose_remediation` surfaces it tagged executable:false.
 *
 * Fail-closed rule: an action we cannot classify is treated as GATED, never SAFE.
 * The policy is frozen at import so a prompt-injected alert cannot flip it mid-run.
 */

export type Tier = "SAFE" | "GATED" | "HARDLINE";

/** Catastrophic targets/actions that DEADMAN refuses even to offer for approval. */
const HARDLINE_PATTERNS: readonly RegExp[] = Object.freeze([
  /delete\s+(the\s+)?(primary|only)\s+database/i,
  /terminate\s+(the\s+)?last\s+(healthy\s+)?replica/i,
  /delete\s+namespace/i,
  /scale\s+core\s+infra(structure)?\s+to\s*0/i,
  /drop\s+(table|schema|database)/i,
]);

/** True if the described action is catastrophic and must be refused. */
export function isHardline(description: string): boolean {
  return HARDLINE_PATTERNS.some((re) => re.test(description));
}

/** Tools that mutate state but are reversible/low-risk → SAFE (auto-run). */
const SAFE_TOOLS = Object.freeze(new Set(["restart_pod"]));

/** Tools that mutate state destructively/irreversibly → GATED (approval). */
const GATED_TOOLS = Object.freeze(
  new Set([
    "bump_memory",
    "rollback_deploy",
    "delete_pvc",
    "scale_to_zero",
    "scale_deployment",
    "cordon_node",
    "drain_node",
  ]),
);

/**
 * Classify a remediation tool by name. Unknown mutating tools fail closed to GATED.
 * (Read-only tools are not passed here; they are never gated.)
 */
export function classifyTool(toolName: string): Tier {
  if (SAFE_TOOLS.has(toolName)) return "SAFE";
  if (GATED_TOOLS.has(toolName)) return "GATED";
  return "GATED"; // fail-closed
}
