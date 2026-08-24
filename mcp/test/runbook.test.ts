import { describe, it, expect } from "vitest";
import { runbookFor, RUNBOOK } from "../src/runbook.js";

describe("runbook", () => {
  it("returns all entries when no symptom is given", () => {
    expect(runbookFor()).toHaveLength(RUNBOOK.length);
  });

  it("finds the OOMKilled rule and it forbids deleting PVCs", () => {
    const hits = runbookFor("OOMKilled");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].rule).toMatch(/bump_memory/i);
    expect(hits[0].rule).toMatch(/never delete a pvc/i);
  });

  it("falls back to all entries for an unknown symptom", () => {
    expect(runbookFor("something-unknown").length).toBe(RUNBOOK.length);
  });
});
