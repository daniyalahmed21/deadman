/**
 * Real kubectl backend against a local `kind` cluster.
 *
 * Enabled with DEADMAN_CLUSTER=kind. Provisions/reseeds from ../k8s/seed.yaml. Health is
 * keyed on the root cause — the memory limit — so `verify_resolution` reflects the actual
 * fix (limit raised to >=512Mi) rather than racing the OOMKill/restart timing.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ClusterBackend, HealthSnapshot, Metrics } from "../backend.js";
import { buildInvestigation } from "../investigate.js";
import type { InvestigationResult } from "../fixtures.js";

const CTX = process.env.KIND_CONTEXT ?? "kind-deadman";
const NS = process.env.KIND_NAMESPACE ?? "prod";
const SEED = fileURLToPath(new URL("../../k8s/seed.yaml", import.meta.url));
/** A resolved deployment has a memory limit at or above this (Mi). */
const HEALTHY_MEM_MIB = 512;

function run(args: string[]): string {
  return execFileSync("kubectl", ["--context", CTX, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function ns(args: string[]): string {
  return run(["-n", NS, ...args]);
}
function nsTry(args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: ns(args) };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    return { ok: false, out: String(err.stderr || err.stdout || err.message || "").trim() };
  }
}

/** Parse a k8s memory quantity ("256Mi", "1Gi", "512M") to MiB. */
function parseMemMib(s: string): number {
  const m = s.match(/^(\d+)(Gi|Mi|G|M)?$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "Gi" || m[2] === "G" ? n * 1024 : n;
}

function memLimit(deployment: string): number {
  const r = nsTry([
    "get",
    "deploy",
    deployment,
    "-o",
    "jsonpath={.spec.template.spec.containers[0].resources.limits.memory}",
  ]);
  return r.ok ? parseMemMib(r.out) : 0;
}
function specReplicas(deployment: string): number {
  const r = nsTry(["get", "deploy", deployment, "-o", "jsonpath={.spec.replicas}"]);
  return r.ok && r.out ? Number(r.out) : 0;
}

/** Real pod memory/cpu from metrics-server (`kubectl top`). Empty until metrics populate. */
function readMetrics(deployment: string): Metrics {
  // `kubectl top pods -l app=<dep> --no-headers` -> "name  <cpu>m  <mem>Mi"
  const r = nsTry(["top", "pods", "-l", `app=${deployment}`, "--no-headers"]);
  const pods = r.ok
    ? r.out
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [name, cpu, mem] = l.trim().split(/\s+/);
          return {
            name: name ?? "",
            cpuMillis: Number((cpu ?? "0m").replace(/m$/, "")) || 0,
            memMib: parseMemMib(mem ?? "0"),
          };
        })
    : [];
  const workingSetMib = pods.reduce((m, p) => Math.max(m, p.memMib), 0);
  const cpuMillis = pods.reduce((s, p) => s + p.cpuMillis, 0);
  return { workingSetMib, cpuMillis, pods };
}

export const kindBackend: ClusterBackend = {
  mode: "kind",

  reset() {
    run(["apply", "-f", SEED]);
  },

  investigate(deployment): InvestigationResult {
    const memLimitMib = memLimit(deployment);
    const raw = nsTry([
      "get",
      "pods",
      "-l",
      `app=${deployment}`,
      "-o",
      'jsonpath={range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[0].restartCount}{" "}{.status.containerStatuses[0].lastState.terminated.reason}{"\\n"}{end}',
    ]);
    const pods = raw.ok
      ? raw.out
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [name, restarts, reason] = l.split(" ");
            return {
              name: name ?? "",
              restarts: Number(restarts ?? 0),
              oomKilled: /OOMKilled/i.test(reason ?? ""),
            };
          })
      : [];
    return buildInvestigation(deployment, memLimitMib, pods, readMetrics(deployment).workingSetMib);
  },

  serviceHealth(deployment): HealthSnapshot {
    const memLimitMib = memLimit(deployment);
    const replicas = specReplicas(deployment);
    const raw = nsTry([
      "get",
      "pods",
      "-l",
      `app=${deployment}`,
      "-o",
      'jsonpath={range .items[*]}{.metadata.name}{" "}{.status.phase}{" "}{.status.containerStatuses[0].restartCount}{"\\n"}{end}',
    ]);
    const pods = raw.ok
      ? raw.out
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [name, phase, restarts] = l.split(" ");
            return { name: name ?? "", phase: phase ?? "", restarts: Number(restarts ?? 0) };
          })
      : [];
    return { deployment, healthy: memLimitMib >= HEALTHY_MEM_MIB && replicas >= 1, memLimitMib, replicas, pods };
  },

  metrics(deployment) {
    return readMetrics(deployment);
  },
  logs(deployment, lines) {
    const r = nsTry(["logs", "-l", `app=${deployment}`, `--tail=${lines}`, "--all-containers=true"]);
    return r.ok ? r.out.split("\n").filter(Boolean) : [`(no logs: ${r.out})`];
  },
  events(deployment) {
    const r = nsTry([
      "get",
      "events",
      "--sort-by=.lastTimestamp",
      "-o",
      'jsonpath={range .items[*]}{.type}{"  "}{.reason}{"  "}{.message}{"\\n"}{end}',
    ]);
    const lines = r.ok ? r.out.split("\n").filter(Boolean) : [];
    const hits = lines.filter((l) => l.includes(deployment) || /OOM|BackOff|Failed|Killing/i.test(l));
    return (hits.length > 0 ? hits : lines).slice(-10);
  },
  deployHistory(deployment) {
    const r = nsTry(["rollout", "history", `deploy/${deployment}`]);
    return r.ok ? r.out.split("\n").filter(Boolean) : [`(no history: ${r.out})`];
  },

  deploymentMem(deployment) {
    const v = memLimit(deployment);
    return v > 0 ? v : undefined;
  },
  deploymentReplicas(deployment) {
    return specReplicas(deployment);
  },
  pvcExists(name) {
    return nsTry(["get", "pvc", name]).ok;
  },

  restartPods(deployment) {
    ns(["rollout", "restart", `deploy/${deployment}`]);
    return `rollout-restarted ${deployment} (root cause unaddressed → will recur)`;
  },
  bumpMemory(deployment, mib) {
    const prev = memLimit(deployment);
    ns(["set", "resources", `deploy/${deployment}`, `--limits=memory=${mib}Mi`]);
    nsTry(["rollout", "status", `deploy/${deployment}`, "--timeout=60s"]);
    return `bumped ${deployment} memory ${prev}Mi → ${mib}Mi`;
  },
  rollbackDeploy(deployment) {
    ns(["rollout", "undo", `deploy/${deployment}`]);
    return `rolled back ${deployment} to previous revision`;
  },
  deletePvc(name) {
    ns(["delete", "pvc", name, "--wait=false"]);
    return `deleted pvc ${name} (IRREVERSIBLE — data gone)`;
  },
  scaleToZero(deployment) {
    ns(["scale", `deploy/${deployment}`, "--replicas=0"]);
    return `scaled ${deployment} to 0 replicas (service DOWN)`;
  },
};
