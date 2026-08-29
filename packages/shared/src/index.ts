/**
 * Shared wire types between the DEADMAN engine and the cockpit UI.
 * One source of truth for what the engine emits and the frontend renders.
 */

export type Tier = "SAFE" | "GATED" | "HARDLINE";
export type Severity = "critical" | "warning" | "info";
export type Phase = "triage" | "investigate" | "remediate" | "verify";
export type BackendMode = "sim" | "kind";

/** A single step in the agent's live activity stream (SSE). */
export type EventKind =
  | "phase"
  | "signal"
  | "proposal"
  | "gate"
  | "action"
  | "refusal"
  | "verify"
  | "rollback"
  | "resolved";

export type EventSeverity = "info" | "warn" | "danger" | "success";

export interface AgentEvent {
  seq: number;
  ts: number;
  kind: EventKind;
  phase?: Phase;
  tier?: Tier;
  action?: string;
  target?: string;
  severity: EventSeverity;
  message: string;
}

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

export type ChangeKind = "deploy" | "image" | "mem_limit" | "replicas" | "config";

export interface ChangeEvent {
  revision: number;
  at: number; // epoch ms
  kind: ChangeKind;
  summary: string;
  memLimitMib?: number;
  /** the limit before this change - lets correlation detect a memory *decrease* (the OOM culprit) */
  previousMemLimitMib?: number;
  imageTag?: string;
  replicas?: number;
}

/** Which recent change most plausibly caused this incident (temporal proximity x plausibility). */
export interface ChangeCorrelation {
  suspected: ChangeEvent | null;
  confidence: number; // 0..1
  minutesBefore: number | null;
  reason: string;
  candidates: { change: ChangeEvent; score: number }[];
}

export interface Investigation {
  root_cause: string;
  evidence: string[];
  validity_score: number;
  is_noise: boolean;
  recommended_action?: string;
  change?: ChangeCorrelation;
}

export interface PodMetric {
  name: string;
  memMib: number;
  cpuMillis: number;
}

/** A past incident recalled as similar to the current one, with the fix that resolved it. */
export interface RecallMatch {
  id: string;
  service: string;
  signal?: string;
  rootCause: string;
  fix: string[];
  score: number;
  strength: "strong" | "likely" | "weak";
  agoDays: number;
}

/** A structured field-level change, for the approval-gate diff. */
export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

/** How far a remediation reaches - the concise blast-radius the human weighs at the gate. */
export interface BlastRadius {
  podsAffected: number;
  disruption: "none" | "rolling" | "restart" | "downtime";
  stateful: boolean;
  reversible: boolean;
  severity: "low" | "medium" | "high";
}

/** How to undo a remediation (null = irreversible). */
export interface RollbackPlan {
  method: string;
  inverse: string;
  beforeState: Record<string, unknown>;
  note?: string;
}

/** The full context shown at the human-approval gate before a destructive action runs. */
export interface RemediationPreview {
  action: string;
  target: string;
  tier: Tier;
  summary: string;
  changes: FieldChange[];
  rawDiff: string;
  blastRadius: BlastRadius;
  rollback: RollbackPlan | null;
  warnings: string[];
  destructive: boolean;
}

/** Result of rehearsing a remediation in an isolated fork of the cluster before touching prod. */
export interface RehearsalResult {
  action: string;
  target: string;
  backend: BackendMode;
  /** true if we actually ran the action in a fork (false = backend can't rehearse in-process) */
  rehearsed: boolean;
  /** did the fork become healthy after the action? */
  pass: boolean;
  before: { healthy: boolean; memLimitMib: number };
  after: { healthy: boolean; memLimitMib: number };
  detail: string;
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
  isNoise: boolean;
  rootCause?: string;
  validity: number;
  actions: number;
  refusals: number;
}

/** Full incident record with the action timeline, for the history detail + replay view. */
export interface IncidentDetail extends IncidentSummary {
  alert?: string;
  evidence: string[];
  memLimitBefore?: number;
  memLimitAfter?: number;
  timeline: AuditEntry[];
}

/** One row of the frozen blast-radius policy, for the Safety view. */
export interface PolicyTier {
  tier: Tier;
  behavior: string;
  tools: string[];
}

/** The engine's safety policy (classifier tiers + hardline patterns), server-emitted. */
export interface Policy {
  tiers: PolicyTier[];
  hardlinePatterns: string[];
}

/** LLM cost/telemetry accumulated by the engine. Honest zeros in deterministic mode. */
export interface CostReport {
  model: string;
  narration: boolean;
  investigations: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  priceInPerMTok: number;
  priceOutPerMTok: number;
  /** Token usage broken down per service (the LLM step is service-scoped, not incident-scoped). */
  perService: {
    service: string;
    inputTokens: number;
    outputTokens: number;
    usd: number;
  }[];
}
