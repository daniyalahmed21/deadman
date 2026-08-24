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

  it("treats a healthy deployment as likely noise", () => {
    const r = buildInvestigation("checkout", 512, [
      { name: "checkout-0", restarts: 0, oomKilled: false },
    ]);
    expect(r.is_noise).toBe(true);
    expect(r.validity_score).toBeLessThan(0.5);
  });
});
