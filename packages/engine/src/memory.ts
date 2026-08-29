/**
 * Incident memory. DEADMAN remembers what fixed past incidents so it can recall a proven fix
 * when a similar alert fires ("last time checkout OOMKilled, bump_memory to 512Mi resolved it").
 * Seeded with prior incidents so recall works on the first live alert; resolved incidents from
 * this session are appended, so it gets smarter over time. In-memory (no infra); a JSON file
 * could back it for durability.
 */

export interface IncidentMemory {
  id: string;
  service: string;
  signal?: string; // OOMKilled | CrashLoopBackOff | ImagePullBackOff | ...
  rootCause: string;
  fix: string[]; // the actions that resolved it, e.g. ["bump_memory:512Mi"]
  at: number; // epoch ms
}

const DAY = 86_400_000;
// Timestamps are relative to load time so "N days ago" stays sensible in a long-running demo.
const t0 = Date.now();

const seed: IncidentMemory[] = [
  { id: "INC-2411", service: "checkout", signal: "OOMKilled", rootCause: "checkout OOMKilled: memory limit below working set", fix: ["bump_memory:512Mi"], at: t0 - 8 * DAY },
  { id: "INC-2388", service: "payments", signal: "CrashLoopBackOff", rootCause: "payments crash-looping after a bad deploy", fix: ["rollback_deploy"], at: t0 - 12 * DAY },
  { id: "INC-2402", service: "search", signal: "ImagePullBackOff", rootCause: "search image pull failing: bad tag", fix: ["rollback_deploy"], at: t0 - 5 * DAY },
  { id: "INC-2350", service: "cart", signal: "OOMKilled", rootCause: "cart OOMKilled under load spike", fix: ["bump_memory:768Mi"], at: t0 - 20 * DAY },
  { id: "INC-2377", service: "checkout", signal: "latency", rootCause: "checkout elevated latency: under-provisioned", fix: ["scale_deployment:6"], at: t0 - 15 * DAY },
];

const memories: IncidentMemory[] = [...seed];

export function allMemories(): IncidentMemory[] {
  return [...memories];
}

/** Append a resolved incident to memory (deduped by id). */
export function rememberIncident(m: IncidentMemory): void {
  if (m.fix.length === 0) return;
  if (memories.some((x) => x.id === m.id)) return;
  memories.push(m);
}

export function resetMemory(): void {
  memories.length = 0;
  memories.push(...seed);
}
