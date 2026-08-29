/**
 * Redis-backed durable audit trail. Attached at boot when alert ingestion is on (so Redis is
 * present), it replays the trail into memory on startup and mirrors every new record to a Redis
 * list. The audit trail is the operator's record of what the agent did to production, so it must
 * survive a restart rather than living only in process memory.
 */

import type { Redis } from "ioredis";
import { createRedisConnection } from "./queue.js";
import type { AuditStore, AuditEntry } from "../audit.js";

const KEY = process.env.DEADMAN_AUDIT_KEY ?? "deadman:audit";

export class RedisAuditStore implements AuditStore {
  /** In-flight writes, so a graceful shutdown can drain them before the connection closes. */
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly redis: Redis = createRedisConnection()) {}

  async load(): Promise<AuditEntry[]> {
    const raw = await this.redis.lrange(KEY, 0, -1);
    return raw.map((s) => JSON.parse(s) as AuditEntry);
  }

  append(entry: AuditEntry): void {
    // Fire-and-forget so a tool response is never blocked or failed by Redis — but TRACK the write
    // (so close() can drain it on shutdown) and LOG failures rather than silently dropping an audit
    // record. The audit trail is the record of what the agent did to production; a lost write must
    // at least be visible, not disappear.
    const write = this.redis.rpush(KEY, JSON.stringify(entry)).then(
      () => undefined,
      (err: unknown) =>
        console.error(
          `[deadman] audit persist FAILED for #${entry.seq} ${entry.action} ${entry.target}:`,
          err instanceof Error ? err.message : err,
        ),
    );
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  async close(): Promise<void> {
    // Drain outstanding writes so a graceful shutdown never loses a just-recorded action, then
    // close cleanly (quit waits for the pending reply; hard-disconnect only if that errors).
    await Promise.allSettled([...this.pending]);
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
