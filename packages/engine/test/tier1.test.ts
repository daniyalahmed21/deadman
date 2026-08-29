import { describe, it, expect, beforeEach } from "vitest";
import * as audit from "../src/audit.js";
import type { AuditEntry, AuditStore } from "../src/audit.js";
import { renderMetrics } from "../src/metrics.js";
import { handleAlertOnce } from "../src/alerts/worker.js";
import type { Idempotency } from "../src/alerts/idempotency.js";
import type { NormalizedAlert } from "../src/alerts/schema.js";

// --- Audit persistence ------------------------------------------------------------------

class FakeAuditStore implements AuditStore {
  entries: AuditEntry[];
  constructor(seed: AuditEntry[] = []) {
    this.entries = [...seed];
  }
  async load() {
    return [...this.entries];
  }
  append(e: AuditEntry) {
    this.entries.push(e);
  }
}

describe("audit persistence", () => {
  beforeEach(() => audit.reset());

  it("mirrors new records to the attached store", async () => {
    const store = new FakeAuditStore();
    await audit.attachAuditStore(store);
    audit.record({ action: "bump_memory", target: "checkout", tier: "GATED", outcome: "ok", isError: false });
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]?.action).toBe("bump_memory");
  });

  it("replays persisted entries on attach and continues the seq", async () => {
    const seeded: AuditEntry[] = [{ seq: 1, action: "restart_pod", target: "checkout", tier: "SAFE", outcome: "ok", isError: false }];
    await audit.attachAuditStore(new FakeAuditStore(seeded));
    expect(audit.all()).toHaveLength(1);
    expect(audit.record({ action: "bump_memory", target: "checkout", tier: "GATED", outcome: "ok", isError: false }).seq).toBe(2);
  });
});

// --- Metrics ----------------------------------------------------------------------------

describe("metrics", () => {
  beforeEach(() => audit.reset());

  it("exposes safety outcomes in Prometheus format", async () => {
    audit.record({ action: "bump_memory", target: "checkout", tier: "GATED", outcome: "ok", isError: false });
    audit.record({ action: "delete_pvc", target: "orders-db", tier: "GATED", outcome: "refused", isError: true });
    const text = await renderMetrics(null);
    expect(text).toMatch(/deadman_audit_entries_total 2/);
    expect(text).toMatch(/deadman_actions_refused_total 1/);
    expect(text).toMatch(/deadman_actions_executed_total 1/);
    expect(text).toMatch(/# TYPE deadman_up gauge/);
    expect(text).not.toMatch(/deadman_alert_queue_depth/); // no ingestion
  });

  it("includes queue metrics when ingestion is on", async () => {
    const text = await renderMetrics({ depth: async () => 3, deadLetterCount: async () => 1 });
    expect(text).toMatch(/deadman_alert_queue_depth 3/);
    expect(text).toMatch(/deadman_alert_dead_letter_total 1/);
  });
});

// --- Idempotency guard ------------------------------------------------------------------

class MemIdempotency implements Idempotency {
  private store = new Map<string, string>();
  async getSession(k: string) {
    return this.store.get(k) ?? null;
  }
  async markSession(k: string, s: string) {
    this.store.set(k, s);
  }
  async close() {}
}

const alert: NormalizedAlert = {
  dedupKey: "checkout:oom:1",
  alertName: "OOMKilled",
  text: "checkout OOMKilled",
  severity: "critical",
  source: "test",
  receivedAt: new Date(0).toISOString(),
  raw: {},
};

describe("alert idempotency guard", () => {
  it("opens a session once, then dedups retries to the same session", async () => {
    const idem = new MemIdempotency();
    let calls = 0;
    const handler = async () => ({ sessionId: `sess-${++calls}` });

    expect(await handleAlertOnce(alert, handler, idem)).toEqual({ sessionId: "sess-1", deduped: false });
    expect(await handleAlertOnce(alert, handler, idem)).toEqual({ sessionId: "sess-1", deduped: true });
    expect(calls).toBe(1); // the second call did NOT open a second session
  });

  it("opens separate sessions for different dedup keys", async () => {
    const idem = new MemIdempotency();
    let calls = 0;
    const handler = async () => ({ sessionId: `sess-${++calls}` });
    await handleAlertOnce(alert, handler, idem);
    await handleAlertOnce({ ...alert, dedupKey: "checkout:oom:2" }, handler, idem);
    expect(calls).toBe(2);
  });
});
