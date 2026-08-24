/**
 * Sensitive-target floor (defense in depth).
 *
 * The primary safety control is TrueForge's per-tool approval gate. This is the SECOND
 * layer: the engine itself refuses destructive operations against catastrophic or protected
 * targets, even if a call somehow arrives approved (or the harness is misconfigured, or an
 * injected alert talked the agent into it). A refusal never mutates state.
 */

import { isHardline } from "./classifier.js";

/** Targets that must never be destroyed, regardless of approval. */
const PROTECTED_TARGET_PATTERNS: readonly RegExp[] = Object.freeze([
  /primary|prod-?db|orders-?db|postgres|mysql|\bdb\b|database/i,
  /core|infra(structure)?|control-plane|etcd/i,
  /kube-system/i,
]);

export interface GuardResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

/** Decide whether a destructive tool may run against a target. */
export function guardDestructive(tool: string, target: string): GuardResult {
  if (isHardline(`${tool} ${target}`)) {
    return { allowed: false, reason: `HARDLINE: "${tool} ${target}" is catastrophic and is refused outright — a license to act has limits.` };
  }
  if (PROTECTED_TARGET_PATTERNS.some((re) => re.test(target))) {
    return { allowed: false, reason: `Sensitive-target floor: "${target}" is a protected resource; ${tool} is refused even with approval.` };
  }
  return { allowed: true };
}
