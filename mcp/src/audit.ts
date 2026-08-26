/**
 * Audit trail. Every mutating tool call - executed or refused - appends one structured
 * record. This is the provenance/audit demo beat and the operator's record of what the
 * agent did to production.
 */

export interface AuditEntry {
  seq: number;
  action: string;
  target: string;
  tier: string;
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
  return entry;
}

export function all(): AuditEntry[] {
  return [...entries];
}

export function reset(): void {
  entries.length = 0;
}
