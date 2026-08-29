import { describe, it, expect } from "vitest";
import { correlateChange, symptomOf } from "../src/correlate.js";
import type { ChangeEvent } from "@deadman/shared";

const MIN = 60000;
const now = 1_000_000_000;

const memCut: ChangeEvent = { revision: 3, at: now - 4 * MIN, kind: "mem_limit", summary: "mem limit 512Mi -> 256Mi", memLimitMib: 256, previousMemLimitMib: 512 };
const oldDeploy: ChangeEvent = { revision: 1, at: now - 3 * 24 * 60 * MIN, kind: "deploy", summary: "initial deploy" };
const labelEdit: ChangeEvent = { revision: 2, at: now - 1 * MIN, kind: "config", summary: "add label" };

describe("change-correlation", () => {
  it("classifies symptoms from root-cause text", () => {
    expect(symptomOf("checkout is OOMKilled (exit 137)")).toBe("oom");
    expect(symptomOf("image pull is failing (ImagePullBackOff)")).toBe("imagepull");
    expect(symptomOf("checkout is crash-looping with 12 restarts")).toBe("crashloop");
    expect(symptomOf("elevated latency on /cart")).toBe("none");
  });

  it("fingers a recent memory-limit cut as the OOM suspect with high confidence", () => {
    const r = correlateChange([oldDeploy, memCut], now, "oom", 256);
    expect(r.suspected?.revision).toBe(3);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9); // 4m proximity (1.0) x mem-cut plausibility (1.0)
    expect(r.minutesBefore).toBe(4);
    expect(r.reason.toLowerCase()).toContain("suspect");
  });

  it("does NOT blame a recent-but-irrelevant change over an old plausible one (recency guard)", () => {
    // label edit is 1m before but implausible for OOM; the mem cut (4m) must still win
    const r = correlateChange([labelEdit, memCut], now, "oom", 256);
    expect(r.suspected?.kind).toBe("mem_limit");
  });

  it("returns no suspect when nothing recent plausibly explains it", () => {
    const r = correlateChange([oldDeploy], now, "oom", 256);
    expect(r.suspected).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.reason).toMatch(/no recent change/i);
  });

  it("never blames a change that happened after onset", () => {
    const after: ChangeEvent = { revision: 4, at: now + 2 * MIN, kind: "mem_limit", summary: "post-incident bump", memLimitMib: 128 };
    const r = correlateChange([after], now, "oom", 256);
    expect(r.suspected).toBeNull();
  });
});
