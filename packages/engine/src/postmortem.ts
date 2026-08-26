/**
 * Postmortem generator - assembles a full incident write-up from the latest investigation,
 * the audit trail (actions executed and refused), and the current health. Pure/deterministic.
 */

import type { AuditEntry } from "./audit.js";
import type { InvestigationSnapshot } from "./incident.js";

export interface PostmortemInput {
  investigation: InvestigationSnapshot | null;
  audit: AuditEntry[];
  resolved: boolean;
  memLimitMib: number;
}

export function buildPostmortem({ investigation, audit, resolved, memLimitMib }: PostmortemInput): string {
  const taken = audit.filter((e) => !e.isError);
  const refused = audit.filter((e) => e.isError);
  const dep = investigation?.deployment ?? "checkout";

  const lines: string[] = [
    `# Incident Postmortem - ${dep}`,
    "",
    `**Status:** ${resolved ? "✅ Resolved" : "🔴 Unresolved"}`,
    "",
    "## Root cause",
    investigation?.root_cause ?? "(investigation not yet run)",
    "",
    "## Evidence",
    ...(investigation?.evidence?.map((e) => `- ${e}`) ?? ["- (none)"]),
    "",
    "## Actions taken",
    taken.length > 0
      ? taken.map((e) => `- **${e.action}** on \`${e.target}\` [${e.tier}] - ${e.outcome}`).join("\n")
      : "- (none)",
    "",
    "## Actions refused (safety controls)",
    refused.length > 0
      ? refused.map((e) => `- **${e.action}** on \`${e.target}\` [${e.tier}] - ${e.outcome}`).join("\n")
      : "- (none)",
    "",
    "## Resolution",
    resolved
      ? `The memory limit was raised to ${memLimitMib}Mi and the deployment recovered.`
      : "The incident is not yet resolved; the recommended fix has not been fully applied.",
    "",
    "## Follow-ups",
    "- Add a memory-usage alert at 80% of the limit to catch this earlier.",
    "- Review the deploy that changed the workload's footprint.",
    "- Confirm the sensitive-target floor and HARDLINE policy remain frozen.",
  ];
  return lines.join("\n");
}
