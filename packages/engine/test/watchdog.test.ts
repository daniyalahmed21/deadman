import { describe, it, expect, beforeEach, vi } from "vitest";
import { armWatchdog } from "../src/watchdog.js";
import * as audit from "../src/audit.js";
import { resetEvents } from "../src/events.js";

const noSleep = () => Promise.resolve();

describe("auto-rollback watchdog", () => {
  beforeEach(() => {
    audit.reset();
    resetEvents();
  });

  it("holds when the target recovers within the window (no rollback)", async () => {
    let ticks = 0;
    const undo = vi.fn(() => "reverted");
    const verdict = await armWatchdog({
      target: "checkout",
      undo,
      windowMs: 5000,
      intervalMs: 1000,
      sleep: noSleep,
      // becomes healthy on the 2nd poll
      health: () => ({ healthy: ++ticks >= 2 }),
    });
    expect(verdict).toBe("held");
    expect(undo).not.toHaveBeenCalled();
    expect(audit.all()).toHaveLength(0);
  });

  it("rolls back when the fix never holds, and audits the revert", async () => {
    const undo = vi.fn(() => "reverted memory 300Mi -> 256Mi");
    const verdict = await armWatchdog({
      target: "checkout",
      undo,
      undoLabel: "auto_rollback",
      windowMs: 3000,
      intervalMs: 1000,
      sleep: noSleep,
      health: () => ({ healthy: false }), // never recovers
    });
    expect(verdict).toBe("rolled_back");
    expect(undo).toHaveBeenCalledTimes(1);
    const entries = audit.all();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("auto_rollback");
    expect(entries[0].outcome).toContain("256Mi");
  });
});
