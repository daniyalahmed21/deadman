/**
 * Incoming-alert intake schema.
 *
 * Every monitor (Datadog, Prometheus Alertmanager, Grafana, PagerDuty, a plain curl) speaks a
 * different JSON dialect. We accept a permissive envelope, then normalise it down to the small
 * shape the rest of DEADMAN reasons about. Unknown vendor fields are kept verbatim under `raw`
 * so nothing is lost on the way to the investigator.
 *
 * The dedup key is the load-bearing part: monitors re-fire the SAME alert every evaluation
 * cycle (Datadog re-sends while a monitor stays "alerting"), so without a stable fingerprint one
 * real incident becomes dozens of sessions. We prefer an explicit fingerprint the vendor already
 * computed, and only fall back to hashing the content.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

export type Severity = "critical" | "warning" | "info";

/** Non-empty trimmed string, else undefined. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Pull the identifying fields from a raw payload, reaching into the NESTED shapes real monitors
 * actually send — not just flat top-level keys:
 *   - Alertmanager / Grafana groups: `commonLabels`, `commonAnnotations`, `groupLabels`, `alerts[0]`
 *   - PagerDuty v3 webhook: `event.data`
 * Used by the schema's refine, `normalizeAlert`, and the dedup key so every path agrees.
 */
/** First non-empty string among the candidates. */
function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const t = str(v);
    if (t) return t;
  }
  return undefined;
}

/** The nested sub-objects real monitors use, safely coerced. */
function nestedParts(raw: Record<string, unknown>) {
  const alerts = Array.isArray(raw.alerts) ? (raw.alerts as Record<string, unknown>[]) : [];
  const a0 = (alerts[0] ?? {}) as Record<string, unknown>;
  return {
    alerts,
    a0,
    a0labels: (a0.labels ?? {}) as Record<string, unknown>,
    a0annot: (a0.annotations ?? {}) as Record<string, unknown>,
    cLabels: (raw.commonLabels ?? {}) as Record<string, unknown>,
    cAnnot: (raw.commonAnnotations ?? {}) as Record<string, unknown>,
    gLabels: (raw.groupLabels ?? {}) as Record<string, unknown>,
    pd: (((raw.event ?? {}) as Record<string, unknown>).data ?? {}) as Record<string, unknown>,
  };
}

export function extractFields(raw: Record<string, unknown>): {
  text?: string;
  alertName?: string;
  source?: string;
  severity?: string;
  fingerprint?: string;
} {
  const p = nestedParts(raw);
  return {
    text: firstStr(raw.text, raw.message, raw.title, p.cAnnot.summary, p.cAnnot.description, p.a0annot.summary, p.a0annot.description, p.pd.title, p.pd.summary, raw.alert_name, raw.alertname),
    alertName: firstStr(raw.alert_name, raw.alertname, raw.title, p.cLabels.alertname, p.gLabels.alertname, p.a0labels.alertname, p.pd.title),
    source: firstStr(raw.alert_source, raw.source) ?? (p.alerts.length > 0 || raw.commonLabels ? "alertmanager" : raw.event ? "pagerduty" : undefined),
    severity: firstStr(raw.severity, p.cLabels.severity, p.a0labels.severity, p.pd.urgency, p.pd.severity),
    fingerprint: firstStr(raw.dedup_key, raw.fingerprint, raw.aggregation_key, raw.alert_id, p.a0.fingerprint, p.pd.id),
  };
}

/**
 * Permissive wire envelope. Only `text` OR one of the common title/message fields is truly
 * required — we coalesce them in `normalizeAlert`. Everything else is optional and, crucially,
 * `.passthrough()` keeps vendor-specific keys (commonLabels, aggregation_key, …) available.
 */
export const IncomingAlertSchema = z
  .object({
    text: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    alert_name: z.string().optional(),
    alertname: z.string().optional(), // Alertmanager label casing
    severity: z.string().optional(),
    source: z.string().optional(),
    alert_source: z.string().optional(), // Datadog/Grafana casing
    received_at: z.string().datetime().optional(),
    // Explicit dedup handles, if the vendor supplies one — always preferred over a content hash.
    dedup_key: z.string().optional(),
    fingerprint: z.string().optional(), // Alertmanager
    aggregation_key: z.string().optional(), // Datadog
    alert_id: z.string().optional(),
  })
  .passthrough()
  .refine((a) => Boolean(extractFields(a as Record<string, unknown>).text), {
    message:
      "alert must carry identifying text (text/message/title/alert_name, or nested " +
      "Alertmanager commonAnnotations / PagerDuty event.data)",
  });

export type IncomingAlert = z.infer<typeof IncomingAlertSchema>;

/** The flattened alert the queue carries and the investigator consumes. */
export interface NormalizedAlert {
  /** stable idempotency key — same real alert re-fired maps to the same value */
  dedupKey: string;
  alertName: string;
  text: string;
  severity: Severity;
  source: string;
  receivedAt: string; // ISO-8601
  /** the untouched inbound payload, so no vendor context is ever dropped */
  raw: Record<string, unknown>;
}

const SEVERITIES: Severity[] = ["critical", "warning", "info"];

function coerceSeverity(v: string | undefined): Severity {
  const s = (v ?? "").toLowerCase();
  if (SEVERITIES.includes(s as Severity)) return s as Severity;
  // Map the common vendor synonyms onto our three buckets.
  if (["error", "fatal", "page", "p1", "sev1", "high"].includes(s)) return "critical";
  if (["warn", "p2", "sev2", "medium"].includes(s)) return "warning";
  return "warning"; // unknown → treat as actionable, never silently drop to info
}

/** Collapse the vendor dialects (flat and nested) into one shape. Pure and deterministic. */
export function normalizeAlert(input: IncomingAlert): NormalizedAlert {
  const f = extractFields(input as Record<string, unknown>);
  const text = f.text ?? "";
  const alertName = f.alertName ?? text.slice(0, 80);
  const source = (f.source ?? "generic").toLowerCase();
  const severity = coerceSeverity(f.severity);
  const receivedAt = str(input.received_at) ?? new Date().toISOString();

  return {
    dedupKey: computeDedupKey(input, { text, alertName, source }),
    alertName,
    text,
    severity,
    source,
    receivedAt,
    raw: { ...input },
  };
}

/**
 * Prefer any fingerprint the vendor already computed (they know their own aggregation rules
 * best); otherwise hash the identifying content. Deliberately excludes timestamps so a re-fire
 * of the same condition collapses to one key.
 */
export function computeDedupKey(
  input: IncomingAlert,
  parts: { text: string; alertName: string; source: string },
): string {
  // Reaches nested vendor fingerprints too (Alertmanager `alerts[0].fingerprint`, PagerDuty id).
  const explicit = extractFields(input as Record<string, unknown>).fingerprint;
  // `:` is reserved in the queue's job-id keyspace (BullMQ), so it must never appear in a key.
  const clean = (s: string) => s.replace(/:/g, "_");
  if (explicit) return `${clean(parts.source)}-${clean(explicit)}`;
  const hash = createHash("sha256").update(`${parts.source}\n${parts.alertName}\n${parts.text}`).digest("hex");
  return `${clean(parts.source)}-${hash.slice(0, 24)}`;
}

/** Parse + normalise in one step. Throws a ZodError with a readable message on bad input. */
export function parseAlert(body: unknown): NormalizedAlert {
  return normalizeAlert(IncomingAlertSchema.parse(body));
}
