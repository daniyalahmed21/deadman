/**
 * Incident memory. DEADMAN remembers what fixed past incidents so it can recall a proven fix
 * when a similar alert fires ("last time checkout OOMKilled, bump_memory to 512Mi resolved it").
 *
 * It is a durable store of incidents THIS cluster actually resolved: it starts empty and grows
 * for real, persisted to a JSON file next to the engine so it survives restarts. Nothing is
 * seeded, so a recalled fix is always something the agent genuinely did before.
 */

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

const memories: IncidentMemory[] = loadPersisted();

export function allMemories(): IncidentMemory[] {
  return [...memories];
}

/** Append a resolved incident to memory (deduped by id) and persist it. */
export function rememberIncident(m: IncidentMemory): void {
  if (m.fix.length === 0) return;
  if (memories.some((x) => x.id === m.id)) return;
  memories.push(m);
  persist();
}

export function resetMemory(): void {
  memories.length = 0;
  memories.push(...loadPersisted());
}
