/**
 * Real kubectl backend — a local `kind` cluster for the demo, or ANY real cluster in production.
 *
 * Enabled with DEADMAN_CLUSTER=kind. Every call shells out to `kubectl`, so it drives whatever
 * cluster the resolved context points at:
 *   - local demo: KIND_CONTEXT (default `kind-deadman`), seeded from ../k8s/seed.yaml.
 *   - production: set KUBE_CONTEXT to an EKS/GKE/AKS context from your kubeconfig (or the literal
 *     "current" to use kubectl's current-context), KUBE_NAMESPACE to the target namespace, and a
 *     kubeconfig scoped to the least-privilege ServiceAccount in ../k8s/rbac.yaml.
 * Health is keyed on the root cause - the memory limit - so `verify_resolution` reflects the
 * actual fix (limit raised to >=512Mi) rather than racing the OOMKill/restart timing.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ClusterBackend, HealthSnapshot, Metrics } from "../backend.js";
import { buildInvestigation } from "../investigate.js";
import type { InvestigationResult } from "../fixtures.js";
import type { ChangeEvent, RehearsalResult } from "@deadman/shared";

// Context resolution: KUBE_CONTEXT points DEADMAN at any real cluster (a cloud context from your
// kubeconfig); the literal "current" uses kubectl's current-context (omits the --context flag).
// KIND_CONTEXT keeps the local-demo default working unchanged.
const CONTEXT = process.env.KUBE_CONTEXT ?? process.env.KIND_CONTEXT ?? "kind-deadman";
const CTX_FLAG = CONTEXT && CONTEXT !== "current" ? ["--context", CONTEXT] : [];
const NS = process.env.KUBE_NAMESPACE ?? process.env.KIND_NAMESPACE ?? "prod";
const SEED = fileURLToPath(new URL("../../k8s/seed.yaml", import.meta.url));
/** A resolved deployment has a memory limit at or above this (Mi). */
const HEALTHY_MEM_MIB = 512;

/** The one kubectl invocation. Never throws; returns exit code plus captured stdout/stderr.
 *  `input` pipes a manifest on stdin (for `diff` / `apply -f -`). */
function exec(args: string[], input?: string): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("kubectl", [...CTX_FLAG, ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, out: out.trim(), err: "" };
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string };
    return { code: x.status ?? 1, out: String(x.stdout ?? "").trim(), err: String(x.stderr ?? "").trim() };
  }
}

/** Throwing variant, for mutations that should fail loudly. */
function run(args: string[]): string {
  const r = exec(args);
  if (r.code !== 0) throw new Error(r.err || r.out || `kubectl ${args.join(" ")} failed`);
  return r.out;
}
/** Namespaced throwing variant. */
const ns = (args: string[]): string => run(["-n", NS, ...args]);

/** Non-throwing: {ok, out} where out is stdout on success, else the error text. */
const runTry = (args: string[]): { ok: boolean; out: string } => {
  const r = exec(args);
  return { ok: r.code === 0, out: r.code === 0 ? r.out : r.err || r.out };
};
const nsTry = (args: string[]): { ok: boolean; out: string } => runTry(["-n", NS, ...args]);
/** Namespaced exec with a manifest on stdin. */
const nsStdin = (args: string[], stdin: string) => exec(["-n", NS, ...args], stdin);

/** Short random suffix for an ephemeral rehearsal namespace. */
function randId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Trim `kubectl diff` output to the meaningful hunks: drop temp-path headers and metadata noise.
 *  Cosmetic only; the structured `changes` field is the source of truth. */
function cleanDiff(out: string): string {
  return out
    .split("\n")
    .filter((l) => !/^(diff -|--- |\+\+\+ )/.test(l))
    .filter((l) => !/last-applied-configuration|generation:|creationTimestamp:|"apiVersion"/.test(l))
    .join("\n")
    .trim();
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

// --- Deployment-object helpers (the only place that knows kubectl JSON shape) ------------

/** Read the live deployment as a plain object with server-managed noise stripped, or null. */
function liveDeployObject(deployment: string): any | null {
  const r = nsTry(["get", "deploy", deployment, "-o", "json"]);
  if (!r.ok) return null;
  try {
    const obj = JSON.parse(r.out);
    delete obj.status;
    if (obj.metadata) delete obj.metadata.managedFields;
    return obj;
  } catch {
    return null;
  }
}

/** Apply an intent patch to a deployment object. kubectl field paths live only here. */
function applyPatch(obj: any, patch: { mib?: number; replicas?: number }): void {
  if (patch.mib !== undefined) {
    const c = obj.spec.template.spec.containers[0];
    c.resources = { ...(c.resources ?? {}), limits: { ...(c.resources?.limits ?? {}), memory: `${patch.mib}Mi` } };
  }
  if (patch.replicas !== undefined) obj.spec.replicas = patch.replicas;
}

/** The namespace's limits.memory ResourceQuota (hard cap and current use, in MiB), or null. */
function readMemoryQuota(): { hardMib: number; usedMib: number } | null {
  const r = nsTry(["get", "resourcequota", "-o", "json"]);
  if (!r.ok) return null;
  let items: any[];
  try {
    items = JSON.parse(r.out).items ?? [];
  } catch {
    return null;
  }
  for (const q of items) {
    const hard = q.status?.hard?.["limits.memory"] ?? q.spec?.hard?.["limits.memory"];
    if (hard) return { hardMib: parseMemMib(String(hard)), usedMib: parseMemMib(String(q.status?.used?.["limits.memory"] ?? "0")) };
  }
  return null;
}

/** Warn if a memory bump would exceed the namespace quota (a Deployment dry-run misses pod-level quota). */
function memoryQuotaWarning(deployment: string, mib?: number): string | null {
  if (mib === undefined) return null;
  const q = readMemoryQuota();
  if (!q) return null;
  const before = memLimit(deployment);
  if (mib <= before) return null;
  const projected = q.usedMib + (mib - before) * specReplicas(deployment);
  return projected > q.hardMib
    ? `Exceeds namespace memory quota: this change projects ${projected}Mi against a ${q.hardMib}Mi cap (${q.usedMib}Mi used now).`
    : null;
}

export const kindBackend: ClusterBackend = {
  mode: "kind",

  reset() {
    // Seeding applies the demo workload (the checkout OOM scenario). Refuse to run it against
    // anything that isn't obviously a local kind cluster unless explicitly forced — DEADMAN must
    // never deploy demo fixtures into a real production cluster.
    const isKindCtx = CONTEXT.startsWith("kind-");
    const forced = (process.env.DEADMAN_ALLOW_SEED ?? "").toLowerCase() === "1";
    if (!isKindCtx && !forced) {
      throw new Error(
        `refusing to seed the demo workload into non-kind context "${CONTEXT}" ` +
          `(set DEADMAN_ALLOW_SEED=1 only if you really mean to)`,
      );
    }
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
  previewChange(deployment, patch) {
    const obj = liveDeployObject(deployment);
    if (!obj) return { rawDiff: "", warnings: [`preview unavailable for ${deployment}`] };
    applyPatch(obj, patch);
    const manifest = JSON.stringify(obj);

    // Real field diff: exit 1 means "differences found" (not an error); >1 is a real failure.
    const d = nsStdin(["diff", "-f", "-"], manifest);
    const rawDiff = d.code <= 1 ? cleanDiff(d.out) : "";

    // Real validity check: the full admission chain (limitrange, webhooks) without persisting.
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
    // Pod-level ResourceQuota is not exercised by a Deployment dry-run, so check headroom directly.
    const quota = memoryQuotaWarning(deployment, patch.mib);
    if (quota) warnings.push(quota);

    return { rawDiff, warnings };
  },
  rehearse(action, target, args) {
    const beforeLimit = memLimit(target);
    const before = { healthy: beforeLimit >= HEALTHY_MEM_MIB, memLimitMib: beforeLimit };
    const skip = (detail: string): RehearsalResult => ({
      action, target, backend: "kind", rehearsed: false, pass: false, before, after: before, detail,
    });

    // Real rehearsal is implemented for the memory case; other actions rely on the watchdog.
    const memMib = args.mib;
    if (action !== "bump_memory" || memMib === undefined) {
      return skip(`kind rehearsal is implemented for bump_memory; ${action} relies on the auto-rollback watchdog.`);
    }
    const obj = liveDeployObject(target);
    if (!obj) return skip(`could not read ${target}`);

    const rehNs = `deadman-rehearse-${randId()}`;
    try {
      // Clone the spec at the proposed limit, forced to 1 replica, with identity stripped.
      applyPatch(obj, { mib: memMib });
      obj.spec.replicas = 1;
      const md = obj.metadata;
      for (const k of ["uid", "resourceVersion", "creationTimestamp", "generation"]) delete md[k];
      if (md.annotations) delete md.annotations["kubectl.kubernetes.io/last-applied-configuration"];
      md.namespace = rehNs;
      const manifest = JSON.stringify(obj);

      runTry(["create", "namespace", rehNs]);
      const applied = exec(["apply", "-f", "-"], manifest);
      if (applied.code !== 0) return skip(`rehearsal apply failed: ${applied.err || applied.out}`);

      // Bounded watch: wait for the rollout (or time out), then read the clone's real pod state.
      runTry(["-n", rehNs, "rollout", "status", `deploy/${target}`, "--timeout=60s"]);
      const st = runTry([
        "-n", rehNs, "get", "pods", "-l", `app=${target}`, "-o",
        'jsonpath={range .items[*]}{.status.phase}|{.status.containerStatuses[0].restartCount}|{.status.containerStatuses[0].lastState.terminated.reason}{"\\n"}{end}',
      ]);
      const lines = st.ok ? st.out.split("\n").filter(Boolean) : [];
      const oom = lines.some((l) => /OOMKilled/i.test(l));
      const running = lines.some((l) => l.startsWith("Running")) && !oom;
      const after = { healthy: running, memLimitMib: memMib };
      return {
        action, target, backend: "kind", rehearsed: true, pass: running,
        before, after,
        detail: running
          ? `clone ran healthy at ${memMib}Mi (no OOM in the watch window; idle load only, not a load test)`
          : oom
            ? `clone OOMKilled at ${memMib}Mi in the rehearsal namespace`
            : `clone did not become ready at ${memMib}Mi`,
      };
    } finally {
      // Fire-and-forget teardown: never block the tool response on namespace deletion.
      runTry(["delete", "namespace", rehNs, "--wait=false"]);
    }
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
    let items: Array<Record<string, any>>;
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
