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
  .refine((a) => Boolean(a.text ?? a.message ?? a.title ?? a.alert_name ?? a.alertname), {
    message: "alert must carry at least one of: text, message, title, alert_name",
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

/** Collapse the vendor dialects into one shape. Pure and deterministic — safe to unit-test. */
export function normalizeAlert(input: IncomingAlert): NormalizedAlert {
  const text = (input.text ?? input.message ?? input.title ?? input.alert_name ?? input.alertname ?? "").trim();
  const alertName = (input.alert_name ?? input.alertname ?? input.title ?? text.slice(0, 80)).trim();
  const source = (input.alert_source ?? input.source ?? "generic").toLowerCase().trim();
  const severity = coerceSeverity(input.severity);
  const receivedAt = input.received_at ?? new Date().toISOString();

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
  const explicit = input.dedup_key ?? input.fingerprint ?? input.aggregation_key ?? input.alert_id;
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
