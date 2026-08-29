/**
 * Incident memory. DEADMAN remembers what fixed past incidents so it can recall a proven fix
 * when a similar alert fires ("last time checkout OOMKilled, bump_memory to 512Mi resolved it").
 *
 * Honesty by backend:
 *  - On a REAL cluster (kind) memory is a durable store of incidents THIS cluster actually
 *    resolved. It starts empty and grows for real, persisted to a JSON file next to the engine.
 *  - In sim/demo it uses a seeded starter knowledge base so recall demonstrably works, without
 *    presenting seeded incidents as things a fresh real cluster experienced.
 */

import { demoMode } from "./config.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

// A real cluster gets a durable, initially-empty store; sim/demo gets the seeded starter KB.
const isKind = !demoMode() && process.env.DEADMAN_CLUSTER === "kind";
const STORE = fileURLToPath(new URL("../.deadman-memory.json", import.meta.url));

function loadPersisted(): IncidentMemory[] {
  try {
    if (existsSync(STORE)) return JSON.parse(readFileSync(STORE, "utf8")) as IncidentMemory[];
  } catch {
    /* corrupt or unreadable store: start empty rather than crash */
  }
  return [];
}

function persist(): void {
  try {
    writeFileSync(STORE, JSON.stringify(memories, null, 2));
  } catch {
    /* best effort: durability is a bonus, not a hard requirement */
  }
}

const memories: IncidentMemory[] = isKind ? loadPersisted() : [...seed];

export function allMemories(): IncidentMemory[] {
  return [...memories];
}

/** Append a resolved incident to memory (deduped by id). On a real cluster it is persisted. */
export function rememberIncident(m: IncidentMemory): void {
  if (m.fix.length === 0) return;
  if (memories.some((x) => x.id === m.id)) return;
  memories.push(m);
  if (isKind) persist();
}

export function resetMemory(): void {
  memories.length = 0;
  memories.push(...(isKind ? loadPersisted() : seed));
}
