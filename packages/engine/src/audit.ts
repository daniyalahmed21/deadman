/**
 * Audit trail. Every mutating tool call - executed or refused - appends one structured
 * record. This is the provenance/audit demo beat and the operator's record of what the
 * agent did to production.
 */

import type { Tier } from "@deadman/shared";
import { emit } from "./events.js";

export interface AuditEntry {
  seq: number;
  action: string;
  target: string;
  tier: Tier;
  before?: unknown;
  after?: unknown;
  outcome: string;
  isError: boolean;
}

/**
 * A durable sink for audit entries. The core keeps the trail in memory for fast reads; a store
 * (the Redis implementation lives in alerts/persist.ts) makes it survive a restart. Dependency
 * inversion: audit.ts stays storage-agnostic and the impl is injected at boot.
 */
export interface AuditStore {
  load(): Promise<AuditEntry[]>;
  append(entry: AuditEntry): void;
}

const entries: AuditEntry[] = [];
let store: AuditStore | null = null;

/** Replay a durable store's entries into memory (restoring seq), then mirror future records to it. */
export async function attachAuditStore(s: AuditStore): Promise<void> {
  const persisted = await s.load();
  entries.length = 0;
  entries.push(...persisted);
  store = s;
}

export function record(e: Omit<AuditEntry, "seq">): AuditEntry {
  const entry: AuditEntry = { seq: entries.length + 1, ...e };
  entries.push(entry);
  store?.append(entry); // fire-and-forget durability; never blocks the tool response
  console.error(
    `[audit] #${entry.seq} ${entry.action} ${entry.target} [${entry.tier}] -> ` +
      `${entry.isError ? "REFUSED/ERROR" : "OK"}: ${entry.outcome}`,
  );
  // Mirror every mutation onto the live stream so the cockpit shows it as it happens.
  const kind = entry.isError ? "refusal" : /rollback/i.test(entry.action) ? "rollback" : "action";
  emit({
    kind,
    tier: entry.tier,
    action: entry.action,
    target: entry.target,
    severity: entry.isError ? "danger" : kind === "rollback" ? "warn" : "success",
    message: entry.isError ? `Refused ${entry.action} on ${entry.target}: ${entry.outcome}` : `${entry.action} ${entry.target}: ${entry.outcome}`,
  });
  return entry;
}

export function all(): AuditEntry[] {
  return [...entries];
}

export function reset(): void {
  entries.length = 0;
  store = null;
}
