/**
 * Triage - the cheap first-pass of the SRE team.
 *
 * Runs before the expensive investigation: classify the alert's severity and whether it's
 * noise, from the alert text alone. Fail-safe: anything unclassified is treated as a real
 * warning worth investigating, never silently dropped.
 */

export type Severity = "critical" | "warning" | "info";

export interface TriageResult {
  is_noise: boolean;
  severity: Severity;
  recommend_investigate: boolean;
  reason: string;
}

export function triageAlert(alert: string): TriageResult {
  const a = alert.toLowerCase();
  if (/\bresolved\b|recovered|test alert|heartbeat|\binfo(rmational)?\b|no longer firing/.test(a)) {
    return { is_noise: true, severity: "info", recommend_investigate: false, reason: "informational / already-resolved signal" };
  }
  if (/oomkill|crashloop|outage|\bdown\b|5\d\d|error rate|not ready|unavailable|failed|killed|exit 137/.test(a)) {
    return { is_noise: false, severity: "critical", recommend_investigate: true, reason: "active failure signal - investigate immediately" };
  }
  // Fail-safe: unknown alerts are warnings, not noise.
  return { is_noise: false, severity: "warning", recommend_investigate: true, reason: "unclassified - investigate to be safe" };
}
