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

const entries: AuditEntry[] = [];

export function record(e: Omit<AuditEntry, "seq">): AuditEntry {
  const entry: AuditEntry = { seq: entries.length + 1, ...e };
  entries.push(entry);
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
}
