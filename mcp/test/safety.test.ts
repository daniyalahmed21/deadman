import { describe, it, expect } from "vitest";
import { classifyTool, isHardline } from "../src/classifier.js";
import { guardDestructive } from "../src/guard.js";

describe("classifier tiers", () => {
  it("classifies the safe tool as SAFE", () => {
    expect(classifyTool("restart_pod")).toBe("SAFE");
  });

  it("classifies known destructive tools as GATED", () => {
    for (const t of ["bump_memory", "rollback_deploy", "delete_pvc", "scale_to_zero"]) {
      expect(classifyTool(t)).toBe("GATED");
    }
  });

  it("fails closed: an unknown mutating tool is GATED, never SAFE", () => {
    expect(classifyTool("nuke_everything")).toBe("GATED");
  });
});

describe("HARDLINE detection", () => {
  it("flags catastrophic phrasings", () => {
    expect(isHardline("delete the primary database")).toBe(true);
    expect(isHardline("delete namespace prod")).toBe(true);
    expect(isHardline("terminate the last healthy replica")).toBe(true);
    expect(isHardline("drop table users")).toBe(true);
  });

  it("does not flag benign remediation", () => {
    expect(isHardline("restart the checkout pod")).toBe(false);
    expect(isHardline("bump_memory checkout")).toBe(false);
  });
});

describe("sensitive-target floor", () => {
  it("refuses destructive ops on protected targets", () => {
    for (const target of ["orders-db-pvc", "prod-db", "core-infra", "kube-system", "postgres-0"]) {
      const r = guardDestructive("delete_pvc", target);
      expect(r.allowed, `expected ${target} refused`).toBe(false);
      expect(r.reason).toBeTruthy();
    }
  });

  it("allows destructive ops on ordinary targets", () => {
    for (const target of ["data-0", "checkout", "cart-cache"]) {
      expect(guardDestructive("delete_pvc", target).allowed, `expected ${target} allowed`).toBe(true);
    }
  });

  it("refuses a catastrophic-phrased target outright (HARDLINE)", () => {
    expect(guardDestructive("delete_pvc", "the primary database volume").allowed).toBe(false);
  });
});
