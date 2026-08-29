/**
 * End-to-end idempotency for alert handling.
 *
 * The queue already dedups re-fires at enqueue (jobId = dedupKey). This guards the *action* path:
 * BullMQ delivers at-least-once, so a job that opened a TrueForge session and then failed
 * downstream would, on retry, open a SECOND session for the same incident. Recording the session
 * against the dedupKey makes the retry (or any re-fire that slipped past queue dedup) a no-op that
 * returns the existing session instead of acting twice.
 */

import type { Redis } from "ioredis";
import { createRedisConnection } from "./queue.js";
import { alertConfig } from "./config.js";

export interface Idempotency {
  /** The TrueForge session already opened for this alert, or null if it is new. */
  getSession(dedupKey: string): Promise<string | null>;
  /** Record the session opened for this alert (expires after the dedup window). */
  markSession(dedupKey: string, sessionId: string): Promise<void>;
  close(): Promise<void>;
}

const key = (dedupKey: string) => `deadman:acted:${dedupKey}`;

export class RedisIdempotency implements Idempotency {
  constructor(private readonly redis: Redis = createRedisConnection()) {}

  getSession(dedupKey: string): Promise<string | null> {
    return this.redis.get(key(dedupKey));
  }

  async markSession(dedupKey: string, sessionId: string): Promise<void> {
    await this.redis.set(key(dedupKey), sessionId, "EX", alertConfig.dedupWindowSec);
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
