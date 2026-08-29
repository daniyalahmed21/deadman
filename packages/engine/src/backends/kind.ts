/**
 * Real kubectl backend against a local `kind` cluster.
 *
 * Enabled with DEADMAN_CLUSTER=kind. Provisions/reseeds from ../k8s/seed.yaml. Health is
 * keyed on the root cause - the memory limit - so `verify_resolution` reflects the actual
 * fix (limit raised to >=512Mi) rather than racing the OOMKill/restart timing.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ClusterBackend, HealthSnapshot, Metrics } from "../backend.js";
import { buildInvestigation } from "../investigate.js";
import type { InvestigationResult } from "../fixtures.js";
import type { ChangeEvent } from "@deadman/shared";

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

/** Namespaced kubectl that pipes a manifest on stdin (for `diff` / `apply -f -`). */
function nsStdin(args: string[], stdin: string): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("kubectl", ["--context", CTX, "-n", NS, ...args], {
      encoding: "utf8",
      input: stdin,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, out: out.trim(), err: "" };
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string };
    return { code: x.status ?? 1, out: String(x.stdout ?? "").trim(), err: String(x.stderr ?? "").trim() };
  }
}

/** Trim `kubectl diff` output to the meaningful hunks: drop temp-path headers and metadata noise. */
function cleanDiff(out: string): string {
  return out
    .split("\n")
    .filter((l) => !/^(diff -|--- |\+\+\+ )/.test(l))
    .filter((l) => !/last-applied-configuration|generation:|creationTimestamp:|"apiVersion"/.test(l))
    .join("\n")
    .trim();
}

/** Cluster-scoped (no namespace) kubectl, for node operations. */
function runTry(args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(args) };
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
    // Capture both terminated (OOMKilled) and waiting (ImagePullBackOff/CrashLoopBackOff) reasons.
    const raw = nsTry([
      "get",
      "pods",
      "-l",
      `app=${deployment}`,
      "-o",
      'jsonpath={range .items[*]}{.metadata.name}|{.status.containerStatuses[0].restartCount}|{.status.containerStatuses[0].lastState.terminated.reason}|{.status.containerStatuses[0].state.waiting.reason}{"\\n"}{end}',
    ]);
    const pods = raw.ok
      ? raw.out
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [name, restarts, terminated, waiting] = l.split("|");
            const reason = terminated || waiting || "";
            return {
              name: name ?? "",
              restarts: Number(restarts ?? 0),
              oomKilled: /OOMKilled/i.test(terminated ?? ""),
              reason,
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
  previousLogs(deployment, lines) {
    // --previous: the container that DIED. Empty/erroring when the pod has never restarted.
    const r = nsTry(["logs", "-l", `app=${deployment}`, "--previous", `--tail=${lines}`, "--all-containers=true"]);
    return r.ok && r.out ? r.out.split("\n").filter(Boolean) : [`(no previous container logs: ${r.out || "pod has not restarted"})`];
  },
  describePod(deployment) {
    const r = nsTry(["describe", "pod", "-l", `app=${deployment}`]);
    return r.ok ? r.out : `(describe failed: ${r.out})`;
  },
  previewChange(deployment, mutate) {
    const live = nsTry(["get", "deploy", deployment, "-o", "json"]);
    if (!live.ok) return { rawDiff: "", warnings: [`preview unavailable: ${live.out}`] };
    let obj: any;
    try {
      obj = JSON.parse(live.out);
    } catch {
      return { rawDiff: "", warnings: ["preview unavailable: could not parse live object"] };
    }
    delete obj.status;
    if (obj.metadata) delete obj.metadata.managedFields;
    mutate(obj);
    const manifest = JSON.stringify(obj);

    // Real field diff: exit 1 means "differences found" (not an error); >1 is a real failure.
    const d = nsStdin(["diff", "-f", "-"], manifest);
    const rawDiff = d.code <= 1 ? cleanDiff(d.out) : "";

    // Real validity check: full admission chain (quota, limitrange, webhooks) without persisting.
    const warnings: string[] = [];
    const v = nsStdin(["apply", "--dry-run=server", "-f", "-"], manifest);
    if (v.code !== 0) {
      warnings.push(`This change would be REJECTED: ${(v.err || v.out).split("\n")[0] || "admission denied"}`);
    } else {
      for (const line of `${v.err}\n${v.out}`.split("\n")) {
        const t = line.trim();
        if (/^Warning:/i.test(t)) warnings.push(t);
      }
    }
    return { rawDiff, warnings };
  },
  namespaceMemoryQuota() {
    const r = nsTry(["get", "resourcequota", "-o", "json"]);
    if (!r.ok) return null;
    let items: any[] = [];
    try {
      items = JSON.parse(r.out).items ?? [];
    } catch {
      return null;
    }
    for (const q of items) {
      const hard = q.status?.hard?.["limits.memory"] ?? q.spec?.hard?.["limits.memory"];
      if (hard) {
        const used = q.status?.used?.["limits.memory"] ?? "0";
        return { hardMib: parseMemMib(String(hard)), usedMib: parseMemMib(String(used)) };
      }
    }
    return null;
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

  changeHistory(deployment): ChangeEvent[] {
    // Read the deployment's ReplicaSets and diff consecutive revisions into typed change events.
    const r = nsTry(["get", "rs", "-o", "json"]);
    if (!r.ok) return [];
    let items: Array<Record<string, any>> = [];
    try {
      items = (JSON.parse(r.out).items ?? []) as Array<Record<string, any>>;
    } catch {
      return [];
    }
    const rss = items
      .filter((rs) => String(rs.metadata?.name ?? "").startsWith(`${deployment}-`))
      .map((rs) => {
        const c = rs.spec?.template?.spec?.containers?.[0] ?? {};
        return {
          revision: Number(rs.metadata?.annotations?.["deployment.kubernetes.io/revision"] ?? 0),
          at: Date.parse(rs.metadata?.creationTimestamp ?? "") || Date.now(),
          image: (c.image as string | undefined) ?? "",
          mem: parseMemMib((c.resources?.limits?.memory as string | undefined) ?? ""),
          // The human "why", if someone recorded it (kubectl annotate kubernetes.io/change-cause=...).
          cause: (rs.metadata?.annotations?.["kubernetes.io/change-cause"] as string | undefined) ?? "",
        };
      })
      .filter((rs) => rs.revision > 0)
      .sort((a, b) => a.revision - b.revision);

    return rss.map((rs, i): ChangeEvent => {
      const prev = rss[i - 1];
      const why = rs.cause ? ` (${rs.cause})` : "";
      if (prev && rs.image && rs.image !== prev.image) {
        return { revision: rs.revision, at: rs.at, kind: "image", summary: `image ${prev.image} -> ${rs.image}${why}`, imageTag: rs.image };
      }
      if (prev && rs.mem > 0 && prev.mem > 0 && rs.mem !== prev.mem) {
        return { revision: rs.revision, at: rs.at, kind: "mem_limit", summary: `mem limit ${prev.mem}Mi -> ${rs.mem}Mi${why}`, memLimitMib: rs.mem, previousMemLimitMib: prev.mem };
      }
      return { revision: rs.revision, at: rs.at, kind: "deploy", summary: `rollout revision ${rs.revision}${why}` };
    });
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
    return `deleted pvc ${name} (IRREVERSIBLE - data gone)`;
  },
  scaleToZero(deployment) {
    ns(["scale", `deploy/${deployment}`, "--replicas=0"]);
    return `scaled ${deployment} to 0 replicas (service DOWN)`;
  },
  scaleDeployment(deployment, replicas) {
    ns(["scale", `deploy/${deployment}`, `--replicas=${replicas}`]);
    return `scaled ${deployment} to ${replicas} replicas`;
  },
  cordonNode(node) {
    run(["cordon", node]);
    return `cordoned ${node} (unschedulable; reversible via uncordon)`;
  },
  drainNode(node) {
    run(["drain", node, "--ignore-daemonsets", "--delete-emptydir-data", "--force"]);
    return `drained ${node} (evicted all pods)`;
  },
  nodeCount() {
    const r = runTry([
      "get",
      "nodes",
      "-o",
      'jsonpath={range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\\n"}{end}',
    ]);
    return r.ok ? r.out.split("\n").filter((l) => l.trim() === "True").length || 1 : 1;
  },
};
