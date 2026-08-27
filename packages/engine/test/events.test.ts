import { describe, it, expect, beforeEach } from "vitest";
import { emit, recent, subscribe, resetEvents, setClock } from "../src/events.js";

describe("event bus", () => {
  beforeEach(() => {
    resetEvents();
    let t = 1000;
    setClock(() => (t += 1));
  });

  it("stamps sequential seq and monotonic ts, and buffers for replay", () => {
    const a = emit({ kind: "phase", severity: "info", message: "one" });
    const b = emit({ kind: "action", severity: "success", message: "two" });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(b.ts).toBeGreaterThan(a.ts);
    const buf = recent();
    expect(buf.map((e) => e.message)).toEqual(["one", "two"]);
  });

  it("fans out live events to subscribers and stops after unsubscribe", () => {
    const got: string[] = [];
    const off = subscribe((e) => got.push(e.message));
    emit({ kind: "signal", severity: "warn", message: "live" });
    off();
    emit({ kind: "signal", severity: "warn", message: "after" });
    expect(got).toEqual(["live"]);
  });

  it("bounds the ring buffer so memory cannot grow unbounded", () => {
    for (let i = 0; i < 250; i++) emit({ kind: "action", severity: "info", message: `e${i}` });
    const buf = recent();
    expect(buf.length).toBe(200);
    expect(buf[buf.length - 1].message).toBe("e249"); // newest retained
    expect(buf[0].message).toBe("e50"); // oldest 50 dropped
  });

  it("a throwing subscriber never breaks emission", () => {
    subscribe(() => {
      throw new Error("boom");
    });
    const got: string[] = [];
    subscribe((e) => got.push(e.message));
    expect(() => emit({ kind: "phase", severity: "info", message: "ok" })).not.toThrow();
    expect(got).toEqual(["ok"]);
  });
});
