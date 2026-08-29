import { describe, it, expect } from "vitest";
import { recallSimilar } from "../src/recall.js";
import type { IncidentMemory } from "../src/memory.js";

const now = Date.now();
const history: IncidentMemory[] = [
  { id: "INC-1", service: "checkout", signal: "OOMKilled", rootCause: "checkout OOMKilled: memory limit too low", fix: ["bump_memory:512Mi"], at: now - 8 * 86_400_000 },
  { id: "INC-2", service: "payments", signal: "CrashLoopBackOff", rootCause: "payments crash-looping after deploy", fix: ["rollback_deploy"], at: now - 12 * 86_400_000 },
  { id: "INC-3", service: "search", signal: "ImagePullBackOff", rootCause: "search bad image tag", fix: ["rollback_deploy"], at: now - 5 * 86_400_000 },
];

describe("incident recall", () => {
  it("recalls the same-service, same-signal past incident as a strong match with its fix", () => {
    const r = recallSimilar({ service: "checkout", signal: "OOMKilled", text: "checkout is OOMKilled, pods restarting" }, history);
    expect(r?.id).toBe("INC-1");
    expect(r?.fix).toContain("bump_memory:512Mi");
    expect(r?.strength).toBe("strong"); // service (+0.25) + signal (+0.35) + text overlap
    expect(r?.agoDays).toBe(8);
  });

  it("matches on signal+text even across services (weaker, but found)", () => {
    const r = recallSimilar({ service: "orders", signal: "CrashLoopBackOff", text: "orders crash-looping after a deploy" }, history);
    expect(r?.id).toBe("INC-2");
  });

  it("returns null when nothing clears the threshold", () => {
    const r = recallSimilar({ service: "billing", signal: "DiskPressure", text: "node disk pressure evicting pods" }, history);
    expect(r).toBeNull();
  });

  it("cold start: with < 2 memories it stays silent", () => {
    expect(recallSimilar({ service: "checkout", signal: "OOMKilled", text: "oom" }, [history[0]])).toBeNull();
  });
});
