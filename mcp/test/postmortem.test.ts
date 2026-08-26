import { describe, it, expect } from "vitest";
import { buildPostmortem } from "../src/postmortem.js";

const inv = {
  deployment: "checkout",
  at: 0,
  root_cause: "checkout is OOMKilled: working set 451Mi exceeds the 256Mi limit",
  evidence: ["pod checkout-0: 7 restarts, OOMKilled", "memory limit 256Mi"],
  validity_score: 0.91,
  is_noise: false,
  report_md: "",
  summary: "OOMKill",
};

describe("postmortem", () => {
  it("includes root cause, actions taken, refusals, and resolution", () => {
    const md = buildPostmortem({
      investigation: inv,
      audit: [
        { seq: 1, action: "bump_memory", target: "checkout", tier: "GATED", outcome: "bumped 256->512", isError: false },
        { seq: 2, action: "drain_node", target: "node-0", tier: "HARDLINE", outcome: "refused: only node", isError: true },
      ],
      resolved: true,
      memLimitMib: 512,
    });
    expect(md).toMatch(/# Incident Postmortem/);
    expect(md).toMatch(/OOMKilled/);
    expect(md).toMatch(/bump_memory/);
    expect(md).toMatch(/drain_node/); // refused action still recorded
    expect(md).toMatch(/✅ Resolved/);
    expect(md).toMatch(/512Mi/);
  });

  it("handles the pre-investigation state gracefully", () => {
    const md = buildPostmortem({ investigation: null, audit: [], resolved: false, memLimitMib: 256 });
    expect(md).toMatch(/investigation not yet run/);
    expect(md).toMatch(/Unresolved/);
  });
});
