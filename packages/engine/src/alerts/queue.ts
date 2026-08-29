/**
 * Durable alert queue.
 *
 * Ingestion is decoupled from processing: the webhook only has to persist the alert and return,
 * so an alert storm (or a slow TrueForge) can never drop an incident or stall the HTTP handler.
 * The contract below is what the webhook and the worker share; the concrete implementation is
 * BullMQ-on-Redis, which gives us the production properties an in-memory deque cannot:
 *
 *   • durability      — jobs live in Redis, so a restart resumes exactly where it left off
 *   • at-least-once   — a job isn't removed until the worker acks success; a crash mid-process
 *                       re-runs it, it does not vanish
 *   • idempotency     — jobId = the alert's dedupKey, so a monitor re-firing the same condition
 *                       is a no-op instead of a duplicate incident
 *   • retries+backoff — transient TrueForge failures are retried with exponential backoff
 *   • dead-letter     — after N attempts a job lands in Redis' `failed` set for inspection,
 *                       rather than being retried forever or silently lost
 *
 * `AlertQueue` is deliberately a narrow interface so a different broker (SQS, Kafka, pg-boss)
 * can be dropped in later without touching the webhook or the bridge — the same kind of seam the
 * engine uses for its cluster backend.
 */

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { alertConfig } from "./config.js";
import type { NormalizedAlert } from "./schema.js";

export interface EnqueueResult {
  /** false when this dedupKey was already in flight/recent — i.e. a duplicate re-fire */
  accepted: boolean;
  dedupKey: string;
  /** number of alerts waiting or active in the queue after this call */
  depth: number;
}

export interface AlertQueue {
  enqueue(alert: NormalizedAlert): Promise<EnqueueResult>;
  /** waiting + active + delayed — a health/observability read */
  depth(): Promise<number>;
  /** jobs parked in the dead-letter (failed) set after exhausting retries */
  deadLetterCount(): Promise<number>;
  close(): Promise<void>;
}

/**
 * A BullMQ connection needs `maxRetriesPerRequest: null` (blocking commands) — this is a hard
 * requirement, BullMQ throws on construction otherwise.
 */
export function createRedisConnection(url = alertConfig.redisUrl): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export class BullAlertQueue implements AlertQueue {
  private readonly queue: Queue;

  constructor(private readonly connection: Redis = createRedisConnection()) {
    this.queue = new Queue(alertConfig.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: alertConfig.attempts,
        backoff: { type: "exponential", delay: alertConfig.backoffMs },
        // Retain completed jobs for the dedup window (so re-fires collapse), then reap them.
        removeOnComplete: { age: alertConfig.dedupWindowSec },
        // Keep failed jobs around as the dead-letter set for inspection; cap the count.
        removeOnFail: { count: 1000 },
      },
    });
  }

  async enqueue(alert: NormalizedAlert): Promise<EnqueueResult> {
    // jobId = dedupKey is the idempotency mechanism: BullMQ refuses to add a second job with an
    // id that already exists, so a re-fired alert is a no-op rather than a duplicate incident.
    // A pre-check gives the caller an accurate accepted/duplicate signal; even if two adds race,
    // BullMQ still collapses them on the shared jobId, so the worst case is a cosmetic mislabel.
    const existing = await this.queue.getJob(alert.dedupKey);
    if (existing) {
      return { accepted: false, dedupKey: alert.dedupKey, depth: await this.depth() };
    }
    await this.queue.add("alert", alert, { jobId: alert.dedupKey });
    return { accepted: true, dedupKey: alert.dedupKey, depth: await this.depth() };
  }

  async depth(): Promise<number> {
    const { waiting, active, delayed } = await this.queue.getJobCounts("waiting", "active", "delayed");
    return (waiting ?? 0) + (active ?? 0) + (delayed ?? 0);
  }

  async deadLetterCount(): Promise<number> {
    const { failed } = await this.queue.getJobCounts("failed");
    return failed ?? 0;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
