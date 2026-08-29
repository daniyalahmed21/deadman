# deadman-mcp

DEADMAN's SRE engine, exposed to TrueForge as a **remote HTTP MCP server** (streamable-HTTP).
It is the whole brain: investigation, the tiered tool surface, the safety layers, the
auto-rollback watchdog, incident memory, and the live event stream. It talks to a cluster
through a swappable backend, so the same tools run against a deterministic sim or a real
[kind](https://kind.sigs.k8s.io) cluster.

## Run

```sh
pnpm install
pnpm dev                 # tsx watch src/server.ts -> http://localhost:9000/mcp
DEADMAN_DEMO_MODE=1 pnpm start   # deterministic sim + OOM scenario, seeds the cockpit
```

`PORT` overrides the port (default 9000).

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

## Cluster backends

Remediation tools talk to a `ClusterBackend` ([`backend.ts`](src/backend.ts)), selected at
boot. The tool signatures and output contracts are identical either way:

- **sim** (default): a deterministic in-memory cluster ([`cluster.ts`](src/cluster.ts)).
  Bulletproof for recording, and what rehearsal forks with `structuredClone`.
- **kind** (`DEADMAN_CLUSTER=kind`): real `kubectl` against a local kind cluster
  ([`backends/kind.ts`](src/backends/kind.ts)). Real work, not mocked.

```sh
pnpm run seed:kind                 # create the kind cluster + seed the OOMKill scenario
DEADMAN_CLUSTER=kind pnpm start    # run the engine against the real cluster
```

The failing scenario ([`k8s/seed.yaml`](k8s/seed.yaml)): a `checkout` deployment that OOMKills
at a 256Mi limit; `bump_memory` to 512Mi or more resolves it. `data-0` is a healthy PVC that is
**not** implicated (the wrong, irreversible fix the agent should decline).

## HTTP endpoints

`POST /mcp` is the MCP transport (stateful streamable-HTTP with per-session transports; `GET`
is the server-to-client SSE, `DELETE` ends the session). The engine also serves the cockpit's
read model:

- `GET /dashboard` a self-contained HTML dashboard, plus `/dashboard/state`, `/incidents`,
  `/cost`, `/policy` (JSON) and `/dashboard/stream` (the live SSE event feed).
- `GET /healthz` backend, demo, and narration status.
- Demo-only (refused unless `DEADMAN_DEMO_MODE`): `POST /dashboard/chaos`, `/demo-run`,
  `/demo-badfix`, `/demo-injection`, and `GET /dashboard/seed-demo`. These drive the scripted
  scenarios and can never erase a live audit trail.

## Configuration

| Env | Effect |
|---|---|
| `DEADMAN_DEMO_MODE` | Forces sim + deterministic + OOM scenario, seeds the cockpit. One flag for an identical run every take. |
| `DEADMAN_CLUSTER=kind` | Use the real kind backend instead of the sim. |
| `ANTHROPIC_API_KEY` | Enables LLM narration (in `.env`). |
| `DEADMAN_LLM_NARRATION=off` | Force deterministic prose. |
| `DEADMAN_LLM_MODEL` | Override the narration model. |
| `DEADMAN_WATCHDOG_WINDOW_MS` / `_INTERVAL_MS` | Watchdog watch window and poll interval. |
| `PORT` | Server port (default 9000). |

## Tests

`pnpm test` runs the vitest suite (68 tests across 14 files): the safety floor and frozen
policy, prompt-injection refusals (`adversarial`), the watchdog, change-correlation, recall,
rehearsal, preview, triage, investigation, postmortem, and the sim cluster. The output
contracts do not change when a backend or narration is swapped, only the tool bodies.
