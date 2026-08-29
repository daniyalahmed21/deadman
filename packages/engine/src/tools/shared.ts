/** Shared plumbing for the MCP tool handlers: result wrappers and the guarded-mutation helper. */

import { classifyTool } from "../classifier.js";
import { guardDestructive } from "../guard.js";
import * as audit from "../audit.js";
import { armWatchdog } from "../watchdog.js";

const WATCHDOG_WINDOW_MS = Number(process.env.DEADMAN_WATCHDOG_WINDOW_MS ?? 4000);
const WATCHDOG_INTERVAL_MS = Number(process.env.DEADMAN_WATCHDOG_INTERVAL_MS ?? 1000);

/** Wrap any JSON-serialisable value as an MCP text result. */
export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Wrap a plain string as an MCP text result. */
export function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/** An error result the model sees as a failed tool call (used for refusals). */
export function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true as const };
}

/**
 * Run a destructive mutation through the sensitive-target floor, then audit it.
 * A refused call never mutates; both outcomes are recorded.
 *
 * A "fix" mutation (one meant to restore health) may pass a `revert` thunk built from the
 * captured before-state. On success the engine arms the auto-rollback watchdog: it watches the
 * target and, if the fix does not hold within the window, runs `revert` and re-verifies.
 */
export function guardedMutation(
  tool: string,
  target: string,
  before: unknown,
  mutate: () => string,
  after: () => unknown,
  revert?: () => string,
) {
  const tier = classifyTool(tool);
  const verdict = guardDestructive(tool, target);
  if (!verdict.allowed) {
    audit.record({ action: tool, target, tier, before, outcome: verdict.reason!, isError: true });
    return err(`[REFUSED] ${verdict.reason}`);
  }
  const outcome = mutate();
  audit.record({ action: tool, target, tier, before, after: after(), outcome, isError: false });
  if (revert) {
    // Fire-and-forget: don't block the tool response on the watch window. The watchdog emits
    // its own events and audits any auto-rollback.
    void armWatchdog({ target, undo: revert, windowMs: WATCHDOG_WINDOW_MS, intervalMs: WATCHDOG_INTERVAL_MS });
  }
  return text(`[${tier}] ${outcome}`);
}
