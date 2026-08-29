/**
 * Configuration for the alert-ingestion pipeline. All knobs are env-driven with production-sane
 * defaults, read once at import so the running config can't drift mid-process.
 */

/** Alert ingestion is opt-in: without it the engine is a pure MCP server (existing behaviour). */
export function alertsEnabled(): boolean {
  const v = (process.env.DEADMAN_ALERTS ?? "").toLowerCase();
  return v === "1" || v === "on" || v === "true" || v === "yes";
}

export const alertConfig = {
  /** BullMQ needs a Redis connection; this is the standard local default. */
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  queueName: process.env.DEADMAN_ALERT_QUEUE ?? "deadman-alerts",
  /** How many times the bridge retries opening a TrueForge session before dead-lettering. */
  attempts: Number(process.env.DEADMAN_ALERT_ATTEMPTS ?? 5),
  /** Base delay (ms) for exponential backoff between retries. */
  backoffMs: Number(process.env.DEADMAN_ALERT_BACKOFF_MS ?? 2000),
  /** Keep completed jobs this long (s) so a re-fired alert still dedups against them. */
  dedupWindowSec: Number(process.env.DEADMAN_ALERT_DEDUP_WINDOW_SEC ?? 3600),
  /** Worker concurrency — how many alerts become TrueForge sessions in parallel. */
  concurrency: Number(process.env.DEADMAN_ALERT_CONCURRENCY ?? 4),

  // --- TrueForge bridge target ---
  trueforgeUrl: process.env.TRUEFORGE_URL ?? "http://localhost:8790",
  agentName: process.env.DEADMAN_AGENT ?? "deadman",
  /** Bearer token for a TrueForge deployment with auth enabled. Empty ⇒ header omitted (local dev). */
  trueforgeToken: process.env.TRUEFORGE_TOKEN ?? "",
  /** Per-call timeout (ms) so a hung TrueForge can't pin a worker slot; abort ⇒ BullMQ retry. */
  trueforgeTimeoutMs: Number(process.env.TRUEFORGE_TIMEOUT_MS ?? 15000),

  // --- Webhook auth ---
  /** Bearer token required for non-loopback callers. Empty ⇒ loopback-only (any remote is 401). */
  ingestToken: process.env.DEADMAN_ALERT_TOKEN ?? "",
} as const;
