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
  constructor(private readonly redis: Redis = createRedisConnection()) {}

  async load(): Promise<AuditEntry[]> {
    const raw = await this.redis.lrange(KEY, 0, -1);
    return raw.map((s) => JSON.parse(s) as AuditEntry);
  }

  append(entry: AuditEntry): void {
    // Fire-and-forget: durability is best-effort and must never block or fail a tool response.
    void this.redis.rpush(KEY, JSON.stringify(entry)).catch(() => {});
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
