import { describe, it, expect } from "vitest";
import { buildInvestigation } from "../src/investigate.js";

describe("root-cause synthesis", () => {
  it("diagnoses an OOMKill from live signals", () => {
    const r = buildInvestigation("checkout", 256, [
      { name: "checkout-0", restarts: 7, oomKilled: true },
    ]);
    expect(r.is_noise).toBe(false);
    expect(r.validity_score).toBeGreaterThan(0.8);
    expect(r.root_cause).toMatch(/OOMKilled/i);
    expect(r.evidence.join(" ")).toMatch(/256Mi/);
    expect(r.summary).toMatch(/512Mi/);
  });

  it("flags restarts without OOMKill as a crash/readiness issue (lower confidence)", () => {
    const r = buildInvestigation("checkout", 512, [
      { name: "checkout-0", restarts: 3, oomKilled: false },
    ]);
    expect(r.is_noise).toBe(false);
    expect(r.root_cause).toMatch(/restart/i);
    expect(r.root_cause).not.toMatch(/OOMKilled/i);
    expect(r.validity_score).toBeLessThan(0.8);
  });

  it("cites the measured working set when metrics are available", () => {
    const r = buildInvestigation("checkout", 256, [{ name: "checkout-0", restarts: 7, oomKilled: true }], 451);
    expect(r.root_cause).toMatch(/451Mi/);
    expect(r.evidence.join(" ")).toMatch(/working set: 451Mi/i);
    expect(r.evidence.join(" ")).toMatch(/metrics-server/i);
  });

  it("diagnoses an OOMKill and recommends bump_memory", () => {
    const r = buildInvestigation("checkout", 256, [{ name: "checkout-0", restarts: 7, oomKilled: true, reason: "OOMKilled" }], 451);
    expect(r.recommended_action).toBe("bump_memory");
  });

  it("diagnoses an ImagePullBackOff and recommends rollback_deploy", () => {
    const r = buildInvestigation("checkout", 256, [{ name: "checkout-0", restarts: 0, oomKilled: false, reason: "ImagePullBackOff" }]);
    expect(r.is_noise).toBe(false);
    expect(r.root_cause).toMatch(/image pull/i);
    expect(r.recommended_action).toBe("rollback_deploy");
  });

  it("diagnoses a CrashLoopBackOff (no OOM) and recommends rollback_deploy", () => {
    const r = buildInvestigation("checkout", 512, [{ name: "checkout-0", restarts: 12, oomKilled: false, reason: "CrashLoopBackOff" }]);
    expect(r.root_cause).toMatch(/crash-looping/i);
    expect(r.recommended_action).toBe("rollback_deploy");
  });

  it("treats a healthy deployment as likely noise", () => {
    const r = buildInvestigation("checkout", 512, [
      { name: "checkout-0", restarts: 0, oomKilled: false },
    ]);
    expect(r.is_noise).toBe(true);
    expect(r.validity_score).toBeLessThan(0.5);
  });
});
