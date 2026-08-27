/**
 * Live agent-event bus. Every meaningful step DEADMAN takes - a phase change, a gathered
 * signal, an executed or refused action, a verify, an auto-rollback - is emitted here and
 * streamed to the cockpit over SSE (GET /dashboard/stream). A bounded ring buffer lets a
 * newly connected client replay recent history so the timeline is never empty.
 */

import type { AgentEvent } from "@deadman/shared";

type Draft = Omit<AgentEvent, "seq" | "ts">;
type Listener = (e: AgentEvent) => void;

const BUFFER_MAX = 200;

let seq = 0;
let now: () => number = () => Date.now();
const buffer: AgentEvent[] = [];
const listeners = new Set<Listener>();

/** Override the clock (tests inject a deterministic one). */
export function setClock(fn: () => number): void {
  now = fn;
}

/** Emit an event: stamp it, buffer it, fan out to subscribers. Returns the stamped event. */
export function emit(draft: Draft): AgentEvent {
  seq += 1;
  const event: AgentEvent = { seq, ts: now(), ...draft };
  buffer.push(event);
  if (buffer.length > BUFFER_MAX) buffer.shift();
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      /* a broken subscriber must never break emission */
    }
  }
  return event;
}

/** Recent events, oldest first, for replay on connect. */
export function recent(): AgentEvent[] {
  return [...buffer];
}

/** Subscribe to future events; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetEvents(): void {
  seq = 0;
  buffer.length = 0;
  listeners.clear();
}
