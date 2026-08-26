/**
 * Shared wire types between the DEADMAN engine and the cockpit UI.
 * One source of truth for what the engine emits and the frontend renders.
 */

export type Tier = "SAFE" | "GATED" | "HARDLINE";
export type Severity = "critical" | "warning" | "info";
export type Phase = "triage" | "investigate" | "remediate" | "verify";
export type BackendMode = "sim" | "kind";

export interface AuditEntry {
  seq: number;
  action: string;
  target: string;
  tier: Tier;
  before?: unknown;
  after?: unknown;
  outcome: string;
  isError: boolean;
  /** epoch ms — present on the event stream */
  at?: number;
}

export interface Investigation {
  root_cause: string;
  evidence: string[];
  validity_score: number;
  is_noise: boolean;
  recommended_action?: string;
}

export interface PodMetric {
  name: string;
  memMib: number;
  cpuMillis: number;
}

export interface DashboardState {
  mode: BackendMode;
  service: string;
  resolved: boolean;
  health: {
    healthy: boolean;
    memLimitMib: number;
    replicas: number;
    pods: { name: string; phase: string; restarts: number }[];
  };
  metrics: { workingSetMib: number; cpuMillis: number };
  investigation: Investigation | null;
  audit: AuditEntry[];
  ts: number;
}

/** A point in the memory/cpu time series the cockpit charts. */
export interface MetricSample {
  ts: number;
  memLimitMib: number;
  workingSetMib: number;
  cpuMillis: number;
}

/** A finished/known incident for the history + replay views. */
export interface IncidentSummary {
  id: string;
  service: string;
  startedAt: number;
  resolvedAt?: number;
  resolved: boolean;
  rootCause?: string;
  actions: number;
  refusals: number;
}

/** Cost/telemetry for the current session (server-computed). */
export interface CostReport {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalUsd: number;
  cacheHitPct: number;
  savedUsd: number;
}
