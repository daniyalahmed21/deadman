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

export interface IncidentRecord {
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
}

const records: IncidentRecord[] = [];

/** Open (or refresh) the record for the current investigation. */
export function openIncident(
  inv: InvestigationSnapshot,
  alert: string | undefined,
  auditLen: number,
  memLimitBefore?: number,
): IncidentRecord {
  const id = `INC-${inv.deployment}-${inv.at}`;
  let rec = records.find((r) => r.id === id);
  if (!rec) {
    rec = {
      id,
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
    };
    records.push(rec);
  } else {
    rec.rootCause = inv.root_cause;
    rec.isNoise = inv.is_noise;
    rec.validity = inv.validity_score;
    rec.evidence = inv.evidence;
    if (alert) rec.alert = alert;
  }
  return rec;
}

/** Close the newest open incident for a service on a verify: slice its own audit window. */
export function closeIncident(
  service: string,
  resolved: boolean,
  audit: AuditEntry[],
  memLimitAfter?: number,
): IncidentRecord | null {
  const rec = [...records].reverse().find((r) => r.service === service);
  if (!rec) return null;
  rec.resolved = resolved;
  rec.resolvedAt = Date.now();
  rec.timeline = audit.slice(rec.auditBaseline);
  rec.memLimitAfter = memLimitAfter;
  return rec;
}

export function allIncidents(): IncidentRecord[] {
  return [...records].reverse(); // newest first
}

export function resetIncidents(): void {
  records.length = 0;
}
