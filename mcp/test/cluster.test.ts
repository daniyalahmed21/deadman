import { describe, it, expect, beforeEach } from "vitest";
import {
  resetCluster,
  snapshotHealth,
  restartPods,
  bumpMemory,
  deletePvc,
  scaleToZero,
  pvcExists,
} from "../src/cluster.js";
import * as audit from "../src/audit.js";

beforeEach(() => {
  resetCluster();
  audit.reset();
});

describe("cluster sim — closed loop", () => {
  it("starts in the seeded failing state", () => {
    const h = snapshotHealth("checkout");
    expect(h.healthy).toBe(false);
    expect(h.memLimitMib).toBe(256);
  });

  it("restart alone does NOT resolve the OOMKill (root cause unaddressed)", () => {
    restartPods("checkout");
    expect(snapshotHealth("checkout").healthy).toBe(false);
  });

  it("bumping memory to >=512Mi resolves it", () => {
    bumpMemory("checkout", 512);
    const h = snapshotHealth("checkout");
    expect(h.healthy).toBe(true);
    expect(h.memLimitMib).toBe(512);
  });

  it("deletePvc removes the PVC", () => {
    expect(pvcExists("data-0")).toBe(true);
    deletePvc("data-0");
    expect(pvcExists("data-0")).toBe(false);
  });

  it("scaleToZero takes the service down", () => {
    scaleToZero("checkout");
    expect(snapshotHealth("checkout").replicas).toBe(0);
    expect(snapshotHealth("checkout").healthy).toBe(false);
  });
});

describe("audit trail", () => {
  it("appends sequential records and returns a copy", () => {
    audit.record({ action: "bump_memory", target: "checkout", tier: "GATED", outcome: "ok", isError: false });
    audit.record({ action: "delete_pvc", target: "orders-db", tier: "GATED", outcome: "refused", isError: true });
    const all = audit.all();
    expect(all.map((e) => e.seq)).toEqual([1, 2]);
    expect(all[1].isError).toBe(true);
    all.push({} as never); // mutating the returned array must not affect internal state
    expect(audit.all()).toHaveLength(2);
  });
});
