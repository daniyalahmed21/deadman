/**
 * Prometheus metrics for the engine. A small, dependency-free exposition of the numbers an
 * operator watches: safety outcomes (executed vs refused), incident throughput, and — when alert
 * ingestion is on — queue depth and dead-letter count. Served at GET /metrics.
 */

import { backend } from "./backend.js";
import * as audit from "./audit.js";
import { allIncidents } from "./incidents.js";

const BOOT_MS = Date.now();

/** The subset of the alert queue that metrics reads (present only when ingestion is on). */
export interface QueueStats {
  depth(): Promise<number>;
  deadLetterCount(): Promise<number>;
}

/** Render Prometheus text-format metrics. */
export async function renderMetrics(queue: QueueStats | null): Promise<string> {
  const entries = audit.all();
  const refused = entries.filter((e) => e.isError).length;
  const incidents = allIncidents();
  const resolved = incidents.filter((i) => i.resolved).length;

  const out: string[] = [];
  const metric = (name: string, help: string, type: "gauge" | "counter", value: number, labels = "") => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name}${labels} ${value}`);
  };

  metric("deadman_up", "1 if the engine is serving", "gauge", 1);
  metric("deadman_uptime_seconds", "seconds since the engine booted", "gauge", Math.floor((Date.now() - BOOT_MS) / 1000));
  metric("deadman_backend_info", "active cluster backend (labelled)", "gauge", 1, `{backend="${backend.mode}"}`);
  metric("deadman_audit_entries_total", "mutating calls recorded (executed or refused)", "counter", entries.length);
  metric("deadman_actions_executed_total", "mutating calls that ran", "counter", entries.length - refused);
  metric("deadman_actions_refused_total", "mutating calls refused by a safety layer", "counter", refused);
  metric("deadman_incidents_total", "incidents worked", "counter", incidents.length);
  metric("deadman_incidents_resolved_total", "incidents resolved", "counter", resolved);
  if (queue) {
    metric("deadman_alert_queue_depth", "alerts waiting, active, or delayed", "gauge", await queue.depth());
    metric("deadman_alert_dead_letter_total", "alerts dead-lettered after exhausting retries", "gauge", await queue.deadLetterCount());
  }
  return out.join("\n") + "\n";
}
