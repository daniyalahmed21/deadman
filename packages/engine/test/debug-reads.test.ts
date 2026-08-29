import { describe, it, expect, beforeEach } from "vitest";
import { resetCluster, podPreviousLogsSim, describePodSim, bumpMemory } from "../src/cluster.js";

describe("debug read tools (sim)", () => {
  beforeEach(() => resetCluster());

  it("previous logs surface the OOM death signal while the pod is failing", () => {
    const logs = podPreviousLogsSim("checkout", 40).join("\n");
    expect(logs).toMatch(/OOMKilled|exit 137/i);
  });

  it("previous logs report no previous container once the fix makes it healthy", () => {
    bumpMemory("checkout", 512);
    const logs = podPreviousLogsSim("checkout", 40).join("\n");
    expect(logs).toMatch(/no previous container/i);
  });

  it("describe_pod shows the restart count and the OOMKilled last state", () => {
    const d = describePodSim("checkout");
    expect(d).toMatch(/Restart Count:/);
    expect(d).toMatch(/OOMKilled/);
    expect(d).toMatch(/Exit Code: 137/);
  });

  it("describe_pod flips Ready to True after the fix", () => {
    bumpMemory("checkout", 512);
    const d = describePodSim("checkout");
    expect(d).toMatch(/Ready\s+True/);
  });
});
