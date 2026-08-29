# deadman-mcp

DEADMAN's SRE engine, exposed to TrueForge as a **remote HTTP MCP server** (streamable-HTTP).
It is the whole brain: investigation, the tiered tool surface, the safety layers, the
auto-rollback watchdog, incident memory, and the live event stream. It talks to a real
[kind](https://kind.sigs.k8s.io) cluster through the `kind` backend (real `kubectl`), so the
tools act on real infrastructure.

## Run

```sh
pnpm install
pnpm dev                 # tsx watch src/server.ts -> http://localhost:9000/mcp
pnpm run seed:kind       # seed the OOMKill scenario into the kind cluster
pnpm start               # run the engine against the real cluster
```

Requires a running kind cluster + kubectl. `PORT` overrides the port (default 9000).

## Register in TrueForge

Settings, Connectors, **Add MCP Server**:

- Name `deadman`, Auth None, Description required.
- URL **`http://host.docker.internal:9000/mcp`** (TrueForge runs in Docker, so `localhost`
  there is the container, not your host).

The agent definition ([`agent.deadman.json`](agent.deadman.json)) runs the incident in four
phases and marks `@destructive` tools as approval-required.

## Tool surface

Every tool is READ or WRITE. The MCP annotation is the machine-readable form of that tag and is
what TrueForge's approval gate reads: `readOnlyHint` runs free, `destructiveHint` pauses for a
human. SAFE writes carry neither and auto-run while staying a visible call.

### READ (never gated)

| Tool | What it returns |
|---|---|
| `triage(alert)` | Severity and noise classification. Fail-safe: unclassified is treated as real. |
| `investigate_incident(alert, service?)` | Root cause from live signals, plus change-correlation, and it builds the remediation plan. |
| `get_service_health(service)` | Current health and error rate. |
| `get_metrics(service?)` | Working-set MiB vs limit (from metrics-server in kind). |
| `get_logs(service?, lines?)` | Tail of container logs. |
| `get_events(service?)` | Recent Kubernetes events (OOMKilling, BackOff, ...). |
| `get_deploy_history(service?)` | Rollout revision history. |
| `propose_remediation(root_cause)` | Candidate actions tagged tier / reversibility / blast radius / rollback, plus a recalled fix. HARDLINE actions are returned `executable:false`. |
| `preview_remediation(action, target, mib?, replicas?)` | Field-level diff, blast radius, and rollback plan: the context shown at the gate. |
| `rehearse_remediation(action, target, mib?, replicas?)` | Forks cluster state, applies the action to the fork, reports pass/fail. Never touches prod. |
| `recall_similar(service, signal?, alert)` | The fix that resolved a similar past incident, with a similarity score. |
| `dry_run(tool, target)` | Server-side validation preview, no mutation. |
| `verify_resolution(target)` | Closed-loop health re-check. On resolution, commits the fix to memory. |
| `get_runbook(symptom?)` | Authoritative SRE decision rules for choosing a fix. |
| `generate_postmortem(service?)` | Markdown postmortem from investigation, audit trail, and health. |
| `get_audit_log()` | The append-only trail of every mutating call, executed or refused. |

### WRITE

| Tool | Tier | Annotation | Gated |
|---|---|---|---|
| `restart_pod(target)` | SAFE | none | no, auto-runs |
| `bump_memory(target, mib)` | GATED | `destructiveHint` | yes (arms the watchdog) |
| `rollback_deploy(target)` | GATED | `destructiveHint` | yes |
| `scale_deployment(target, replicas)` | GATED | `destructiveHint` | yes (arms the watchdog) |
| `delete_pvc(target)` | GATED | `destructiveHint` | yes (irreversible) |
| `scale_to_zero(target)` | GATED | `destructiveHint` | yes (takes the service down) |
| `cordon_node(node)` | GATED | `destructiveHint` | yes |
| `drain_node(node)` | GATED | `destructiveHint` | yes, refused if it is the last schedulable node |

HARDLINE actions (delete the primary database, drain the last node, delete a namespace) are
**not** registered as tools. `propose_remediation` surfaces them tagged `executable:false` so
the model can see the limit but can never invoke it.

## Safety layers

Defense in depth. A destructive call must clear all of these:

1. **TrueForge approval gate** (primary, in the harness): `destructiveHint` tools pause for a
   human Allow/Deny. A denial is obeyed, not retried.
2. **Blast-radius classifier** ([`classifier.ts`](src/classifier.ts)): tags each tool SAFE /
   GATED / HARDLINE. Frozen at import so an injected alert cannot flip it mid-run. Fail-closed:
   an unknown mutating tool is treated as GATED, never SAFE.
3. **Sensitive-target floor** ([`guard.ts`](src/guard.ts)): the engine refuses destructive ops
   on protected or catastrophic targets (primary/prod databases, core/infra, `kube-system`),
   even if the call somehow arrives approved. A refusal never mutates.
4. **Auto-rollback watchdog** ([`watchdog.ts`](src/watchdog.ts)): after a fix runs, the engine
   watches the target. If it does not recover within the window it runs the captured revert and
   re-verifies. Reversibility is a primitive, not an afterthought.

Every mutating call, executed or refused, is written to the append-only audit trail
([`audit.ts`](src/audit.ts)) and emitted on the event stream.

## Investigation and memory

- **Live root cause** ([`investigate.ts`](src/investigate.ts)): derived from the active
  backend's real signals (memory limit, restarts, OOMKill status, working set). The diagnosis
  changes when the cluster does.
- **Change-correlation** ([`correlate.ts`](src/correlate.ts)): scores recent changes by
  temporal proximity times plausibility and names the one most likely to blame (a memory-limit
  *decrease* right before an OOM is the smoking gun).
- **Recall** ([`recall.ts`](src/recall.ts), [`memory.ts`](src/memory.ts)): TF-IDF plus cosine
  similarity over past incidents, boosted by matching service and signal. On resolution,
  `verify_resolution` commits the incident and its winning fix, so recall improves over time.
- **Optional LLM narration** ([`llm.ts`](src/llm.ts)): Claude narrates the prose (root cause,
  report, summary) grounded in the same evidence while the numeric fields stay deterministic.
  On automatically when `ANTHROPIC_API_KEY` is present (put it in `packages/engine/.env`,
  gitignored); falls back to the deterministic write-up on any missing key or error.
  `DEADMAN_LLM_NARRATION=off` forces deterministic (recommended for a repeatable recording),
  and `DEADMAN_LLM_MODEL` overrides the model (default `claude-opus-4-8`).

## Cluster backend

Remediation tools talk to a `ClusterBackend` ([`backend.ts`](src/backend.ts)), which exports the
single `kind` backend: real `kubectl` ([`backends/kind.ts`](src/backends/kind.ts)) against a
local kind cluster for dev, or any real cluster in production. Real work, not mocked.

```sh
pnpm run seed:kind                 # create the kind cluster + seed the OOMKill scenario
pnpm start                         # run the engine against the real cluster
```

The failing scenario ([`k8s/seed.yaml`](k8s/seed.yaml)): a `checkout` deployment that OOMKills
at a 256Mi limit (the workload is `polinux/stress --vm-bytes 350M`), with a real 512Mi->256Mi
rollout history that change-correlation reads from actual ReplicaSets; `bump_memory` to 512Mi or
more resolves it. `data-0` is a healthy PVC that is **not** implicated (the wrong, irreversible
fix the agent should decline).

### Connect a real cluster (production)

The `kind` backend is just real `kubectl` — point it at any EKS/GKE/AKS cluster from your
kubeconfig. No code change; it drives whatever the resolved context targets.

```sh
kubectl apply -f k8s/rbac.yaml     # least-privilege ServiceAccount + Role (see the file header)
KUBE_CONTEXT=<your-context> \      # or "current" to use kubectl's current-context
  KUBE_NAMESPACE=<your-namespace> \
  pnpm start
```

- **Least privilege:** [`k8s/rbac.yaml`](k8s/rbac.yaml) grants exactly the verbs DEADMAN uses —
  read telemetry + the specific gated remediations, no cluster-admin. Node ops and the rehearsal
  sandbox need the optional (elevated) `ClusterRole` in that file; omit it to stay namespace-bound.
- **Safety:** `reset()` (which applies the demo workload) refuses to run against any non-`kind-*`
  context unless `DEADMAN_ALLOW_SEED=1`, so DEADMAN can never seed demo fixtures into prod.
- `KUBE_CONTEXT`/`KUBE_NAMESPACE` are the production knobs; `KIND_CONTEXT`/`KIND_NAMESPACE` remain
  as the local-demo defaults (`kind-deadman` / `prod`).

## HTTP endpoints

`POST /mcp` is the MCP transport (stateful streamable-HTTP with per-session transports; `GET`
is the server-to-client SSE, `DELETE` ends the session). The engine also serves the cockpit's
read model:

- `GET /dashboard` a self-contained HTML dashboard, plus `/dashboard/state`, `/incidents`,
  `/cost`, `/policy` (JSON) and `/dashboard/stream` (the live SSE event feed).
- `POST /alerts` durable alert ingestion (opt-in), plus `GET /alerts/health` (queue depth +
  dead-letter count). See [Alert ingestion](#alert-ingestion-production).
- `GET /healthz` (liveness: process up) and `GET /readyz` (readiness: the cluster backend is
  reachable, and Redis too when ingestion is on — 503 when a dependency is down).
- `GET /metrics` Prometheus metrics: safety outcomes (executed vs refused), incident throughput,
  and, when ingestion is on, alert queue depth and dead-letter count.

## Alert ingestion (production)

How a real company connects DEADMAN to their monitoring. Off by default (`DEADMAN_ALERTS=1`);
when off, the engine is a pure MCP server exactly as before.

A monitor (Datadog, Prometheus Alertmanager, Grafana, PagerDuty, or a plain `curl`) POSTs an
alert to **`POST /alerts`**. The webhook validates and normalises it, then persists it to a
**durable BullMQ/Redis queue** and returns `202` immediately — so an alert storm or a slow
TrueForge can never block the caller or drop an incident. A background worker then turns each
alert into a **TrueForge session**, so the agent investigates and remediates through the *same*
approval gate a human uses. Ingestion is deliberately decoupled from processing:

```
monitor ──POST /alerts──▶ validate + normalise ──▶ BullMQ/Redis queue ──202
                                                          │ (worker, at-least-once)
                                                          ▼
                                        open TrueForge session + post the alert as turn 1
                                                          ▼
                                        investigate ▶ propose ▶ APPROVAL GATE ▶ remediate
```

Production properties (why this is not an in-memory queue): **durable** (survives restart via
Redis AOF), **at-least-once** (a job isn't removed until the worker acks), **idempotent** (a
monitor re-firing the same condition dedups on `jobId` — one incident, not fifty), **retried**
with exponential backoff, and **dead-lettered** (parked in Redis' `failed` set after N attempts,
never lost or looped forever). `AlertQueue` ([`alerts/queue.ts`](src/alerts/queue.ts)) is a
narrow interface, so SQS / Kafka / pg-boss can replace Redis without touching the webhook or the
bridge — the same seam the cluster backends use.

Idempotency is enforced **end to end**: beyond the enqueue-time `jobId` dedup, the worker records
the opened session per `dedupKey` ([`alerts/idempotency.ts`](src/alerts/idempotency.ts)), so a
retry (at-least-once delivery) returns the existing session instead of opening a second one — so
at-least-once *delivery* never becomes at-least-once *remediation*. The **audit trail is durable**
too ([`alerts/persist.ts`](src/alerts/persist.ts)): it replays from Redis on boot and mirrors
every mutating call, so a restart never loses the record of what the agent did to production.

```sh
docker compose -f docker-compose.redis.yml up -d   # Redis for the queue
DEADMAN_ALERTS=1 pnpm start                         # enable ingestion

# fire a Datadog-shaped alert (loopback is trusted; remote callers need the bearer token)
curl -X POST http://localhost:9000/alerts -H 'Content-Type: application/json' \
  -d '{"alert_name":"checkout OOMKilled","alert_source":"datadog","severity":"critical","text":"checkout-api pods OOMKilling at 256Mi"}'
# -> 202 {"queued":true,"duplicate":false,"dedup_key":"datadog:...","queue_depth":1}
```

`GET /alerts/health` reports queue depth and the dead-letter count. Auth: loopback callers are
trusted; any remote caller must present `Authorization: Bearer $DEADMAN_ALERT_TOKEN` (without a
token set, remote calls are refused and ingestion is loopback-only).

## Configuration

| Env | Effect |
|---|---|
| `DEADMAN_ALERTS` | Enable `POST /alerts` ingestion (needs Redis). Off ⇒ pure MCP server. |
| `REDIS_URL` | Redis connection for the queue (default `redis://127.0.0.1:6379`). |
| `DEADMAN_ALERT_TOKEN` | Bearer token required for non-loopback `POST /alerts` callers. |
| `TRUEFORGE_URL` | TrueForge base URL the worker opens sessions against (default `http://localhost:8790`). |
| `DEADMAN_AGENT` | Agent name the worker drives (default `deadman`). |
| `DEADMAN_ALERT_ATTEMPTS` / `_BACKOFF_MS` / `_DEDUP_WINDOW_SEC` / `_CONCURRENCY` | Queue retry, backoff, dedup window, and worker concurrency tuning. |
| `DEADMAN_AUDIT_KEY` | Redis key for the durable audit trail (default `deadman:audit`). |
| `KUBE_CONTEXT` / `KUBE_NAMESPACE` | Select the target cluster/namespace in production (default local `kind-deadman` / `prod`). |
| `ANTHROPIC_API_KEY` | Enables LLM narration (in `.env`). |
| `DEADMAN_LLM_NARRATION=off` | Force deterministic prose. |
| `DEADMAN_LLM_MODEL` | Override the narration model. |
| `DEADMAN_WATCHDOG_WINDOW_MS` / `_INTERVAL_MS` | Watchdog watch window and poll interval. |
| `PORT` | Server port (default 9000). |

## Tests

`pnpm test` runs the vitest suite (75 tests across 13 files): the safety floor and frozen
policy, prompt-injection refusals (`adversarial`), the watchdog, change-correlation, recall,
rehearsal, preview, triage, investigation, postmortem, the kind cluster, alert normalisation +
dedup (`alerts`), and audit persistence + metrics + the idempotency guard (`tier1`). The output
contracts do not change when narration is swapped, only the tool bodies.

`pnpm lint` (ESLint) and `pnpm test:coverage` (v8) round out the quality gates; `pnpm lint` runs
in CI and `max-lines` is a hard error, so no file may sprawl past 500 lines.
