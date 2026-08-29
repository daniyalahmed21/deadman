import { describe, it, expect } from "vitest";
import { previewRemediation } from "../src/preview.js";

/**
 * The state-independent shape of the approval-gate preview: tier, blast shape, rollback, and
 * warnings. The live before/after values and pod counts come from the real cluster and are
 * covered by the e2e/integration run, not here.
 */
describe("remediation preview (approval-gate diff)", () => {
  it("bump_memory: GATED, reversible, and targets the new limit", () => {
    const p = previewRemediation("bump_memory", "checkout", { mib: 512 });
    expect(p.tier).toBe("GATED");
    expect(p.destructive).toBe(true);
    expect(p.blastRadius.reversible).toBe(true);
    expect(p.changes[0]).toMatchObject({ after: "512Mi" });
    expect(p.rawDiff).toContain("512Mi");
  });

  it("delete_pvc: HIGH severity, stateful, irreversible (no rollback), warned", () => {
    const p = previewRemediation("delete_pvc", "orders-db-pvc");
    expect(p.blastRadius.severity).toBe("high");
    expect(p.blastRadius.stateful).toBe(true);
    expect(p.blastRadius.reversible).toBe(false);
    expect(p.rollback).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/irreversible/i);
  });

  it("scale_deployment to zero: downtime disruption, high severity, warned", () => {
    const p = previewRemediation("scale_deployment", "checkout", { replicas: 0 });
    expect(p.blastRadius.disruption).toBe("downtime");
    expect(p.blastRadius.severity).toBe("high");
    expect(p.warnings.join(" ")).toMatch(/down/i);
  });

  it("restart_pod: not destructive, warns it won't fix the root cause", () => {
    const p = previewRemediation("restart_pod", "checkout");
    expect(p.destructive).toBe(false);
    expect(p.warnings.join(" ")).toMatch(/recur/i);
  });
});
