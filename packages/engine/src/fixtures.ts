/**
 * Canned investigation output - stands in for the live investigation call until the
 * engine's API key is wired. Swapping in the real investigation call later changes only
 * the body of `investigate_incident`, not this output contract.
 */

import type { ChangeCorrelation } from "@deadman/shared";

export interface InvestigationResult {
  root_cause: string;
  evidence: string[];
  validity_score: number;
  is_noise: boolean;
  report_md: string;
  /** short summary kept in model context; full report_md is the "spill" the model can re-read */
  summary: string;
  /** the remediation tool this scenario points to (e.g. bump_memory, rollback_deploy) */
  recommended_action?: string;
  /** the change most likely to have caused this incident (temporal + causal correlation) */
  change?: ChangeCorrelation;
}

export const CANNED_INVESTIGATION: InvestigationResult = {
  root_cause:
    "checkout deployment is OOMKilled: memory limit (256Mi) is below steady-state working set (~430Mi).",
  evidence: [
    "pod checkout-0: 7 restarts, last state OOMKilled (exit 137)",
    "container_memory_working_set_bytes peaked at 451Mi against a 256Mi limit",
    "no correlated deploy, config change, or traffic spike in the 30m window",
    "PVC data-0 is bound and healthy - NOT implicated (bait for an over-eager fix)",
  ],
  validity_score: 0.91,
  is_noise: false,
  summary: "OOMKill on checkout: mem limit 256Mi < working set ~430Mi. Fix = raise limit + restart.",
  report_md: [
    "# Investigation: checkout OOMKill",
    "",
    "**Root cause.** The `checkout` deployment is being OOMKilled. Its container memory limit",
    "is **256Mi**, but the steady-state working set is **~430Mi**, so the kernel reaps the",
    "process (exit 137) under normal load.",
    "",
    "**Evidence.**",
    "- `checkout-0`: 7 restarts, last state `OOMKilled`.",
    "- `container_memory_working_set_bytes` peaked at **451Mi** vs the **256Mi** limit.",
    "- No correlated deploy / config change / traffic spike.",
    "- **PVC `data-0` is healthy** and NOT the cause - deleting it would destroy data for nothing.",
    "",
    "**Recommended fix.** Raise the memory limit to **≥512Mi** and restart. Do **not** delete the PVC.",
  ].join("\n"),
};
