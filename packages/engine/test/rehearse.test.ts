import { describe, it, expect, beforeEach } from "vitest";
import { rehearse } from "../src/rehearse.js";
import { resetCluster, setScenario, snapshotHealth } from "../src/cluster.js";

describe("sandbox rehearsal (sim fork)", () => {
  beforeEach(() => {
    setScenario("oom"); // failing OOM: 256Mi limit, unhealthy
    resetCluster();
    setScenario("oom");
  });

  it("PASS: rehearsing the correct fix (bump to 512Mi) turns the fork healthy", () => {
    const r = rehearse("bump_memory", "checkout", { mib: 512 });
    expect(r.rehearsed).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.before.healthy).toBe(false);
    expect(r.after.healthy).toBe(true);
  });

  it("FAIL: rehearsing a too-small fix (300Mi) does NOT resolve the OOM", () => {
    const r = rehearse("bump_memory", "checkout", { mib: 300 });
    expect(r.rehearsed).toBe(true);
    expect(r.pass).toBe(false);
    expect(r.after.healthy).toBe(false);
  });

  it("FAIL: rehearsing restart_pod does not address the root cause", () => {
    const r = rehearse("restart_pod", "checkout");
    expect(r.pass).toBe(false);
  });

  it("prod state is ALWAYS restored after a rehearsal (fork is discarded)", () => {
    const before = snapshotHealth("checkout");
    rehearse("bump_memory", "checkout", { mib: 512 }); // would resolve, but only in the fork
    const after = snapshotHealth("checkout");
    expect(after.memLimitMib).toBe(before.memLimitMib); // 256Mi, unchanged
    expect(after.healthy).toBe(before.healthy); // still unhealthy - the real fix hasn't run
  });

  it("unknown actions are not faked as a PASS", () => {
    const r = rehearse("delete_pvc", "orders-db-pvc");
    expect(r.rehearsed).toBe(false);
    expect(r.pass).toBe(false);
  });
});
