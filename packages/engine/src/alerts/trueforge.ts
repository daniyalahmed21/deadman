/**
 * Minimal TrueForge REST client — just enough to open a session and post the first turn.
 *
 * This is the bridge target: an ingested alert becomes a real TrueForge session so the agent
 * investigates it through the SAME harness a human uses, which means the approval gate still
 * fires on destructive remediation. We deliberately do NOT call the engine's investigator
 * directly from the worker — routing through TrueForge is what preserves graduated autonomy.
 *
 * API shape verified against TrueForge v0.1.x:
 *   POST /api/v1/sessions            {agent:{name}}                       -> { id }
 *   POST /api/v1/sessions/{id}/turns {input:[{type:"user.message",content}]}
 */

import { alertConfig } from "./config.js";
import type { NormalizedAlert } from "./schema.js";

export interface OpenedSession {
  sessionId: string;
  turnId?: string;
}

async function tfFetch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // A real TrueForge deployment gates its API; send the bearer when configured. Empty ⇒ omitted
  // (local dev runs with auth disabled), so this is safe either way.
  if (alertConfig.trueforgeToken) headers.Authorization = `Bearer ${alertConfig.trueforgeToken}`;

  // Bound every call: a hung TrueForge must not pin a worker slot indefinitely. The abort turns
  // into a thrown error, which BullMQ retries with backoff — the same path as a 5xx.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), alertConfig.trueforgeTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${alertConfig.trueforgeUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const reason = controller.signal.aborted ? `timed out after ${alertConfig.trueforgeTimeoutMs}ms` : String(err);
    throw new Error(`TrueForge ${path} -> ${reason}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Throw so BullMQ retries with backoff — a 5xx or a not-yet-ready TrueForge is transient.
    throw new Error(`TrueForge ${path} -> HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Human-readable brief handed to the agent as the session's opening message. */
function alertBrief(alert: NormalizedAlert): string {
  return [
    `A new **${alert.severity.toUpperCase()}** alert has fired from \`${alert.source}\`.`,
    `Investigate the root cause and remediate it behind the approval gate.`,
    ``,
    `Alert: ${alert.alertName}`,
    `Details: ${alert.text}`,
    ``,
    `Full payload:`,
    "```json",
    JSON.stringify(alert.raw, null, 2),
    "```",
  ].join("\n");
}

/**
 * Open a TrueForge session for this alert and post the alert as the first turn.
 * Any non-2xx throws — the caller (the BullMQ worker) turns that into a retry.
 */
export async function openSessionForAlert(alert: NormalizedAlert): Promise<OpenedSession> {
  const session = await tfFetch("/api/v1/sessions", { agent: { name: alertConfig.agentName } });
  const sessionId = String(session.id ?? (session.data as Record<string, unknown> | undefined)?.id ?? "");
  if (!sessionId) throw new Error(`TrueForge session create returned no id: ${JSON.stringify(session).slice(0, 200)}`);

  const turn = await tfFetch(`/api/v1/sessions/${sessionId}/turns`, {
    input: [{ type: "user.message", content: alertBrief(alert) }],
  });
  const turnId = turn.id ? String(turn.id) : undefined;

  return { sessionId, turnId };
}
