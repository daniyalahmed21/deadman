import { describe, it, expect, beforeEach } from "vitest";
import { previewRemediation } from "../src/preview.js";
import { resetCluster, setScenario } from "../src/cluster.js";

describe("remediation preview (approval-gate diff)", () => {
  beforeEach(() => {
    setScenario("oom");
    resetCluster();
    setScenario("oom");
  });

  it("bump_memory: shows the field diff, low severity, and a reversible rollback", () => {
    const p = previewRemediation("bump_memory", "checkout", { mib: 512 });
    expect(p.tier).toBe("GATED");
    expect(p.changes[0]).toMatchObject({ before: "256Mi", after: "512Mi" });
    expect(p.blastRadius.reversible).toBe(true);
    expect(p.blastRadius.severity).toBe("medium"); // rolling restart of pods
    expect(p.rollback?.inverse).toContain("256");
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
