/**
 * Optional LLM narration of an investigation.
 *
 * The deterministic RCA (from live signals) is always the base. When an ANTHROPIC_API_KEY
 * is present and narration is enabled, Claude rewrites the prose fields (root_cause,
 * report_md, summary) grounded in that same evidence - the numeric fields (validity_score,
 * is_noise, evidence) stay deterministic. Any missing key, refusal, or error falls back to
 * the base, so behaviour is safe either way.
 *
 * Model defaults to claude-opus-4-8 (override with DEADMAN_LLM_MODEL). Narration is on when
 * a key is present unless DEADMAN_LLM_NARRATION=off (set it off for a fully deterministic demo).
 * Uses structured outputs (output_config.format) so the response is guaranteed-valid JSON.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { InvestigationResult } from "./fixtures.js";
import { demoMode } from "./config.js";
import { recordInvestigation, recordUsage } from "./cost.js";

const MODEL = process.env.DEADMAN_LLM_MODEL ?? "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  properties: {
    root_cause: { type: "string" },
    report_md: { type: "string" },
    summary: { type: "string" },
  },
  required: ["root_cause", "report_md", "summary"],
  additionalProperties: false,
};

let cached: Anthropic | null | undefined;
function client(): Anthropic | null {
  if (cached !== undefined) return cached;
  const off = demoMode() || (process.env.DEADMAN_LLM_NARRATION ?? "auto").toLowerCase() === "off";
  cached = !off && process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return cached;
}

/** True if LLM narration will run (key present and not disabled). */
export function narrationEnabled(): boolean {
  return client() !== null;
}

/** Rewrite the prose fields of an investigation via Claude; fall back to `base` on any issue. */
export async function narrate(base: InvestigationResult, alert: string, service = "checkout"): Promise<InvestigationResult> {
  recordInvestigation();
  const c = client();
  if (!c) return base;
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You are a senior SRE writing an incident root-cause analysis. Ground every statement " +
        "strictly in the evidence provided - never invent metrics, causes, or remediations. " +
        "Return only the structured fields: a one-sentence root_cause, a short markdown report_md, " +
        "and a one-line summary.",
      messages: [
        {
          role: "user",
          content:
            `Alert: ${alert}\n\n` +
            `Deterministic finding: ${base.root_cause}\n` +
            `Evidence:\n- ${base.evidence.join("\n- ")}\n` +
            `validity_score=${base.validity_score} is_noise=${base.is_noise}`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
    if (res.usage) recordUsage(service, res.usage.input_tokens ?? 0, res.usage.output_tokens ?? 0);
    if (res.stop_reason === "refusal") return base;
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return base;
    const p = JSON.parse(block.text) as Partial<Pick<InvestigationResult, "root_cause" | "report_md" | "summary">>;
    const strip = (s: string) => s.replace(/[—–]/g, "-"); // no em/en dashes in output
    return {
      ...base,
      root_cause: strip(p.root_cause || base.root_cause),
      report_md: strip(p.report_md || base.report_md),
      summary: strip(p.summary || base.summary),
    };
  } catch {
    return base;
  }
}
