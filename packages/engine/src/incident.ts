/**
 * In-memory snapshot of the current incident's investigation, so the dashboard and the
 * postmortem can reference the latest root cause without re-running the investigation.
 */

import type { InvestigationResult } from "./fixtures.js";

export interface InvestigationSnapshot extends InvestigationResult {
  deployment: string;
  at: number;
}

let last: InvestigationSnapshot | null = null;

export function setInvestigation(deployment: string, r: InvestigationResult): void {
  last = { ...r, deployment, at: Date.now() };
}

export function getInvestigation(): InvestigationSnapshot | null {
  return last;
}

export function resetIncident(): void {
  last = null;
}
