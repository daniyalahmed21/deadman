import { describe, it, expect } from "vitest";
import { normalizeAlert, computeDedupKey, parseAlert, IncomingAlertSchema } from "../src/alerts/schema.js";

/**
 * The alert-intake layer is where vendor chaos becomes one clean shape, and where a re-fired
 * alert must collapse to a single incident. These are the pure, deterministic parts — the load-
 * bearing logic worth pinning down (the queue/worker are integration-tested against live Redis).
 */

describe("normalizeAlert: coalesces vendor dialects", () => {
  it("takes text from message/title/alert_name when `text` is absent", () => {
    expect(normalizeAlert({ message: "CPU on fire" }).text).toBe("CPU on fire");
    expect(normalizeAlert({ title: "High latency" }).text).toBe("High latency");
    expect(normalizeAlert({ alert_name: "OOMKilled" }).text).toBe("OOMKilled");
  });

  it("prefers explicit `text` over the fallbacks", () => {
    const n = normalizeAlert({ text: "primary", message: "secondary", title: "tertiary" });
    expect(n.text).toBe("primary");
  });

  it("derives alert_name from alertname/title when not given", () => {
    expect(normalizeAlert({ alertname: "PaymentsHighErrorRate", text: "x" }).alertName).toBe("PaymentsHighErrorRate");
    expect(normalizeAlert({ title: "Disk full", text: "x" }).alertName).toBe("Disk full");
  });

  it("reads the vendor source-key casings and lowercases them", () => {
    expect(normalizeAlert({ text: "x", alert_source: "Datadog" }).source).toBe("datadog");
    expect(normalizeAlert({ text: "x", source: "GRAFANA" }).source).toBe("grafana");
    expect(normalizeAlert({ text: "x" }).source).toBe("generic");
  });
});

describe("normalizeAlert: severity mapping", () => {
  it("passes through the three canonical buckets", () => {
    expect(normalizeAlert({ text: "x", severity: "critical" }).severity).toBe("critical");
    expect(normalizeAlert({ text: "x", severity: "warning" }).severity).toBe("warning");
    expect(normalizeAlert({ text: "x", severity: "info" }).severity).toBe("info");
  });

  it("maps common vendor synonyms onto the buckets", () => {
    expect(normalizeAlert({ text: "x", severity: "P1" }).severity).toBe("critical");
    expect(normalizeAlert({ text: "x", severity: "error" }).severity).toBe("critical");
    expect(normalizeAlert({ text: "x", severity: "warn" }).severity).toBe("warning");
  });

  it("treats an unknown severity as actionable (warning), never silently info", () => {
    expect(normalizeAlert({ text: "x", severity: "banana" }).severity).toBe("warning");
    expect(normalizeAlert({ text: "x" }).severity).toBe("warning");
  });
});

describe("dedup key: the idempotency contract", () => {
  it("prefers an explicit vendor fingerprint over a content hash", () => {
    const key = computeDedupKey({ fingerprint: "abc123", text: "t" }, { text: "t", alertName: "n", source: "grafana" });
    expect(key).toBe("grafana-abc123");
  });

  it("honours dedup_key > fingerprint > aggregation_key > alert_id precedence", () => {
    const base = { text: "t" };
    const parts = { text: "t", alertName: "n", source: "datadog" };
    expect(computeDedupKey({ ...base, dedup_key: "D", fingerprint: "F" }, parts)).toBe("datadog-D");
    expect(computeDedupKey({ ...base, fingerprint: "F", aggregation_key: "A" }, parts)).toBe("datadog-F");
    expect(computeDedupKey({ ...base, aggregation_key: "A", alert_id: "I" }, parts)).toBe("datadog-A");
    expect(computeDedupKey({ ...base, alert_id: "I" }, parts)).toBe("datadog-I");
  });

  it("never emits a `:` in the key (reserved in the queue job-id keyspace)", () => {
    const hashed = normalizeAlert({ text: "x", alert_source: "datadog" }).dedupKey;
    const explicit = computeDedupKey({ fingerprint: "a:b:c", text: "t" }, { text: "t", alertName: "n", source: "da:dog" });
    expect(hashed).not.toContain(":");
    expect(explicit).not.toContain(":");
  });

  it("a re-fired alert with the SAME content hashes to the SAME key", () => {
    const a = normalizeAlert({ text: "checkout OOMKilled", alert_name: "OOM", alert_source: "datadog" });
    const b = normalizeAlert({ text: "checkout OOMKilled", alert_name: "OOM", alert_source: "datadog" });
    expect(a.dedupKey).toBe(b.dedupKey);
  });

  it("different content produces different keys", () => {
    const a = normalizeAlert({ text: "checkout OOMKilled", alert_source: "datadog" });
    const b = normalizeAlert({ text: "checkout CrashLoop", alert_source: "datadog" });
    expect(a.dedupKey).not.toBe(b.dedupKey);
  });

  it("ignores volatile fields (timestamps) so a re-fire still dedups", () => {
    const a = normalizeAlert({ text: "same", alert_source: "datadog", received_at: "2026-08-29T10:00:00.000Z" });
    const b = normalizeAlert({ text: "same", alert_source: "datadog", received_at: "2026-08-29T11:30:00.000Z" });
    expect(a.dedupKey).toBe(b.dedupKey);
  });
});

describe("parseAlert: validation", () => {
  it("rejects a payload with no identifying content", () => {
    expect(() => parseAlert({ severity: "critical" })).toThrow();
  });

  it("accepts a minimal `{text}` payload", () => {
    expect(parseAlert({ text: "something broke" }).text).toBe("something broke");
  });

  it("keeps unknown vendor fields under raw (passthrough)", () => {
    const n = parseAlert({ text: "x", commonLabels: { team: "payments" }, weird_field: 42 });
    expect(n.raw.commonLabels).toEqual({ team: "payments" });
    expect(n.raw.weird_field).toBe(42);
  });

  it("schema alone still enforces the content requirement", () => {
    expect(() => IncomingAlertSchema.parse({})).toThrow();
  });
});
