import { describe, it, expect } from "vitest";
import { triageAlert } from "../src/triage.js";
import { classifyTool } from "../src/classifier.js";

describe("triage (first-pass classification)", () => {
  it("flags an active failure as critical and not noise", () => {
    const r = triageAlert("checkout deployment OOMKilled, pods restarting");
    expect(r.is_noise).toBe(false);
    expect(r.severity).toBe("critical");
    expect(r.recommend_investigate).toBe(true);
  });

  it("treats resolved/informational alerts as noise", () => {
    const r = triageAlert("INFO: alert resolved, service recovered");
    expect(r.is_noise).toBe(true);
    expect(r.severity).toBe("info");
    expect(r.recommend_investigate).toBe(false);
  });

  it("fails safe: an unclassified alert is a warning worth investigating", () => {
    const r = triageAlert("something odd happened at the edge");
    expect(r.is_noise).toBe(false);
    expect(r.recommend_investigate).toBe(true);
  });
});

describe("new remediation actions are GATED", () => {
  it("classifies scale/cordon/drain as GATED", () => {
    for (const t of ["scale_deployment", "cordon_node", "drain_node"]) {
      expect(classifyTool(t)).toBe("GATED");
    }
  });
});
