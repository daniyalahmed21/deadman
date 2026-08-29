/**
 * The bridge worker: pull an ingested alert off the durable queue and turn it into a live
 * TrueForge session. This is the piece that decouples "an alert arrived" (fast, must never
 * block or drop) from "an agent is working it" (slow, may fail, must be retried).
 *
 * Failure handling is BullMQ's job: a throw here re-queues the alert with exponential backoff,
 * and after the configured attempts it lands in the dead-letter (failed) set instead of being
 * lost or looped forever.
 */

import { Worker, type Job } from "bullmq";
import { alertConfig } from "./config.js";
import { createRedisConnection } from "./queue.js";
import { openSessionForAlert } from "./trueforge.js";
import { RedisIdempotency, type Idempotency } from "./idempotency.js";
import type { NormalizedAlert } from "./schema.js";
import { emit } from "../events.js";
import type { Redis } from "ioredis";

export interface AlertWorker {
  close(): Promise<void>;
}

export type AlertHandler = (
  alert: NormalizedAlert,
  onSessionCreated?: (sessionId: string) => Promise<void> | void,
) => Promise<{ sessionId: string }>;

/**
 * Handle one alert exactly once. Idempotency guard: if a session already exists for this alert
 * (a retry, or a re-fire that slipped past queue dedup), return it instead of opening a second
 * one. Pure and injectable, so the guard is unit-testable without Redis or TrueForge.
 */
export async function handleAlertOnce(
  alert: NormalizedAlert,
  handler: AlertHandler,
  idem: Idempotency,
): Promise<{ sessionId: string; deduped: boolean }> {
  const existing = await idem.getSession(alert.dedupKey);
  if (existing) {
    emit({
      kind: "signal",
      phase: "triage",
      severity: "info",
      message: `Alert "${alert.alertName}" already being investigated (session ${existing}) — not re-opened`,
    });
    return { sessionId: existing, deduped: true };
  }
  // Record the session the instant it exists (before the first turn is posted), so a turn failure
  // + BullMQ retry reuses it instead of opening a second session for the same incident.
  const { sessionId } = await handler(alert, (sid) => idem.markSession(alert.dedupKey, sid));
  await idem.markSession(alert.dedupKey, sessionId); // idempotent backstop if the handler skipped the callback
  return { sessionId, deduped: false };
}

/**
 * Start the worker. `handler` and `idem` default to the real TrueForge bridge and Redis store but
 * are injectable so tests can drive the worker without a live TrueForge.
 */
export function startAlertWorker(
  handler: AlertHandler = openSessionForAlert,
  connection: Redis = createRedisConnection(),
  idem: Idempotency = new RedisIdempotency(),
): AlertWorker {
  const worker = new Worker<NormalizedAlert>(
    alertConfig.queueName,
    async (job: Job<NormalizedAlert>) => {
      const { sessionId } = await handleAlertOnce(job.data, handler, idem);
      return { sessionId };
    },
    { connection, concurrency: alertConfig.concurrency },
  );

  worker.on("completed", (job, result: { sessionId: string }) => {
    const alert = job.data;
    console.log(`[deadman] alert ${alert.dedupKey} -> TrueForge session ${result.sessionId}`);
    emit({
      kind: "signal",
      phase: "triage",
      severity: "info",
      message: `Alert "${alert.alertName}" (${alert.source}) opened investigation session ${result.sessionId}`,
    });
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const exhausted = attemptsMade >= alertConfig.attempts;
    console.error(
      `[deadman] alert ${job?.data?.dedupKey} failed (attempt ${attemptsMade}/${alertConfig.attempts})` +
        `${exhausted ? " — DEAD-LETTERED" : " — will retry"}: ${err.message}`,
    );
    if (exhausted && job) {
      emit({
        kind: "refusal",
        phase: "triage",
        severity: "danger",
        message: `Alert "${job.data.alertName}" could not reach TrueForge after ${alertConfig.attempts} attempts — dead-lettered for inspection`,
      });
    }
  });

  return {
    async close() {
      await worker.close();
      await idem.close();
    },
  };
}
