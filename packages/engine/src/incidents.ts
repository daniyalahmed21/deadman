/**
 * Incident history. `incident.ts` holds the single live investigation; this holds the
 * append-only record of every incident DEADMAN has worked, for the history + replay views.
 *
 * An incident opens when an investigation is set and closes/updates when the operator runs
 * verify_resolution. Because the audit trail is one global append-only log, each record
 * captures the audit length at open time (its baseline) so its timeline is exactly the
 * actions taken between open and close - never another incident's.
 */

import type { AuditEntry } from "./audit.js";
import type { InvestigationSnapshot } from "./incident.js";
import type { IncidentDetail } from "@deadman/shared";

interface IncidentRecord {
  id: string;
  service: string;
  startedAt: number;
  resolvedAt?: number;
  resolved: boolean;
  isNoise: boolean;
  rootCause?: string;
  validity: number;
  alert?: string;
  evidence: string[];
  memLimitBefore?: number;
  memLimitAfter?: number;
  timeline: AuditEntry[];
  /** audit-trail length when this incident opened; its timeline starts here */
  auditBaseline: number;
  /** true once verify_resolution has closed this incident; a closed record is never rewritten */
  closed: boolean;
}

const records: IncidentRecord[] = [];
let seq = 0;

/**
 * Open a record for the current investigation. Each investigation is its own incident with a
 * unique monotonic id, so two incidents opened in the same millisecond never collide or merge.
 */
export function openIncident(
  inv: InvestigationSnapshot,
  alert: string | undefined,
  auditLen: number,
  memLimitBefore?: number,
): IncidentRecord {
  seq += 1;
  const rec: IncidentRecord = {
    id: `INC-${inv.deployment}-${seq}`,
    service: inv.deployment,
    startedAt: inv.at,
    resolved: false,
    isNoise: inv.is_noise,
    rootCause: inv.root_cause,
    validity: inv.validity_score,
    alert,
    evidence: inv.evidence,
    memLimitBefore,
    timeline: [],
    auditBaseline: auditLen,
    closed: false,
  };
  records.push(rec);
  return rec;
}

/**
 * Close the newest still-open incident for a service on a verify. A record is closed exactly
 * once: re-verifying after it has closed (or after a newer incident opened) never rewrites it,
 * and its timeline is sliced to the incident's own audit window, so incidents never mix.
 */
export function closeIncident(
  service: string,
  resolved: boolean,
  audit: AuditEntry[],
  memLimitAfter?: number,
): IncidentDetail | null {
  const rec = [...records].reverse().find((r) => r.service === service && !r.closed);
  if (!rec) return null;
  rec.closed = true;
  rec.resolved = resolved;
  rec.resolvedAt = Date.now();
  rec.timeline = audit.slice(rec.auditBaseline);
  rec.memLimitAfter = memLimitAfter;
  return toDetail(rec);
}

/** Project an internal record onto the shared wire type: adds actions/refusals, drops internals. */
function toDetail(rec: IncidentRecord): IncidentDetail {
  return {
    id: rec.id,
    service: rec.service,
    startedAt: rec.startedAt,
    resolvedAt: rec.resolvedAt,
    resolved: rec.resolved,
    isNoise: rec.isNoise,
    rootCause: rec.rootCause,
    validity: rec.validity,
    alert: rec.alert,
    evidence: rec.evidence,
    memLimitBefore: rec.memLimitBefore,
    memLimitAfter: rec.memLimitAfter,
    timeline: rec.timeline,
    actions: rec.timeline.length,
    refusals: rec.timeline.filter((e) => e.isError).length,
  };
}

/** All incidents as wire-typed details, newest first. */
export function allIncidents(): IncidentDetail[] {
  return [...records].reverse().map(toDetail);
}

export function resetIncidents(): void {
  records.length = 0;
  seq = 0;
}
