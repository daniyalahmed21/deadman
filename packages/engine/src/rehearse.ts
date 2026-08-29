/**
 * Sandbox rehearsal. Before a risky remediation touches prod, DEADMAN rehearses it and reports
 * whether it resolves the incident, without changing production. This is a thin dispatch to the
 * active backend, which owns its own isolation strategy:
 *   - sim  forks its in-memory state (deep copy, applied via the same causal mutators, restored).
 *   - kind clones the deployment into a throwaway namespace and watches it under real cgroup
 *     enforcement, then deletes the namespace.
 * A "PASS" is causally honest either way: a wrong fix genuinely fails to make it healthy.
 */

import { backend } from "./backend.js";
import type { RehearsalResult } from "@deadman/shared";

export function rehearse(action: string, target: string, args: { mib?: number; replicas?: number } = {}): RehearsalResult {
  return backend.rehearse(action, target, args);
}
