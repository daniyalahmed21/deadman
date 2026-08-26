/**
 * Live incident-cockpit state. The dashboard (mcp/public/dashboard.html) polls
 * GET /dashboard/state and renders this. Same-origin with the engine, so no CORS/proxy.
 */

import { backend } from "./backend.js";
import { getInvestigation } from "./incident.js";
import * as audit from "./audit.js";

export function dashboardState() {
  const inv = getInvestigation();
  const service = inv?.deployment ?? "checkout";
  const health = backend.serviceHealth(service);
  const metrics = backend.metrics(service);
  return {
    mode: backend.mode,
    service,
    resolved: health.healthy,
    health: {
      healthy: health.healthy,
      memLimitMib: health.memLimitMib,
      replicas: health.replicas,
      pods: health.pods,
    },
    metrics: { workingSetMib: metrics.workingSetMib, cpuMillis: metrics.cpuMillis },
    investigation: inv
      ? {
          root_cause: inv.root_cause,
          evidence: inv.evidence,
          validity_score: inv.validity_score,
          is_noise: inv.is_noise,
        }
      : null,
    audit: audit.all(),
    ts: Date.now(),
  };
}
