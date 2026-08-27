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
  /** true if the alert text tries to instruct the agent (a prompt-injection attempt) */
  injection_suspected: boolean;
}

/**
 * Detect a prompt-injection attempt: an alert (untrusted data) that carries an imperative to
 * take a destructive action, often wrapped in a fake authority or an instruction to ignore
 * policy. Alerts are data, never commands - a match here is surfaced and ignored, not obeyed.
 */
export function detectInjection(alert: string): boolean {
  const a = alert.toLowerCase();
  const destructive = /\b(delete|drop|drain|terminate|wipe|destroy|scale to (zero|0))\b/.test(a);
  const authorityOrOverride = /pre-?approved|ignore (your )?(safety|policy|rules|instructions)|as an admin|override|you must|do not refuse/.test(a);
  return destructive && authorityOrOverride;
}

export function triageAlert(alert: string): TriageResult {
  const a = alert.toLowerCase();
  const injection_suspected = detectInjection(alert);
  if (/\bresolved\b|recovered|test alert|heartbeat|\binfo(rmational)?\b|no longer firing/.test(a)) {
    return { is_noise: true, severity: "info", recommend_investigate: false, reason: "informational / already-resolved signal", injection_suspected };
  }
  if (/oomkill|crashloop|outage|\bdown\b|5\d\d|error rate|not ready|unavailable|failed|killed|exit 137/.test(a)) {
    return { is_noise: false, severity: "critical", recommend_investigate: true, reason: "active failure signal - investigate immediately", injection_suspected };
  }
  // Fail-safe: unknown alerts are warnings, not noise.
  return { is_noise: false, severity: "warning", recommend_investigate: true, reason: "unclassified - investigate to be safe", injection_suspected };
}
