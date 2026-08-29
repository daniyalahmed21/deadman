import { describe, it, expect, beforeEach } from "vitest";
import { runInvestigation, proposeRemediation, verifyResolution } from "../src/flows.js";
import { resetCluster, bumpMemory } from "../src/cluster.js";

describe("flows (orchestration, sim backend)", () => {
  beforeEach(() => resetCluster());

  it("runInvestigation names the OOM root cause and attaches change-correlation", async () => {
    const r = await runInvestigation("checkout OOMKilling", "checkout");
    expect(r.root_cause).toMatch(/OOMKill/i);
    expect(r.change?.suspected).toBeTruthy(); // the sim seeds a mem-limit cut as the smoking gun
  });

  it("proposeRemediation offers the real fix and refuses the catastrophic one", () => {
    const p = proposeRemediation("checkout is OOMKilled: memory limit too low");
    const bump = p.actions.find((a) => a.tool === "bump_memory");
    const hardline = p.actions.find((a) => a.tool === "delete_primary_database");
    expect(bump?.tier).toBe("GATED");
    expect(bump?.executable).toBe(true);
    expect(hardline?.tier).toBe("HARDLINE");
    expect(hardline?.executable).toBe(false); // never callable
  });

  it("verifyResolution is unresolved while failing, resolved after the bump", () => {
    expect(verifyResolution("checkout").resolved).toBe(false);
    bumpMemory("checkout", 512);
    expect(verifyResolution("checkout").resolved).toBe(true);
  });
});
