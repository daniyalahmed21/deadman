# deadman-mcp

DEADMAN's SRE engine, exposed to TrueForge as a **remote HTTP MCP server** (streamable-HTTP).

## Run

```sh
npm install
npm run dev          # http://localhost:9000/mcp   (PORT env overrides)
```

## Register in TrueForge

Settings → Connectors → **Add MCP Server**:
- Name: `deadman`  ·  Description: *required*  ·  Auth: None
- URL: **`http://host.docker.internal:9000/mcp`** (TrueForge runs in Docker; `localhost` there is the container, not your host).

## Tool surface

| Tool | Class | Annotation | Gated? |
|---|---|---|---|
| `investigate_incident(alert)` | READ | `readOnlyHint` | no |
| `get_service_health(service)` | READ | `readOnlyHint` | no |
| `propose_remediation(root_cause)` | READ | `readOnlyHint` | no |
| `dry_run(tool, target)` | READ | `readOnlyHint` | no |
| `verify_resolution(target)` | READ | `readOnlyHint` | no |
| `restart_pod(target)` | WRITE (reversible) | — | no (SAFE, auto) |
| `bump_memory(target, mib)` | WRITE | `destructiveHint` | **yes** |
| `rollback_deploy(target)` | WRITE | `destructiveHint` | **yes** |
| `delete_pvc(target)` | WRITE | `destructiveHint` | **yes** |
| `scale_to_zero(target)` | WRITE | `destructiveHint` | **yes** |

HARDLINE actions (delete primary DB, delete namespace, …) are **not** registered as tools;
`propose_remediation` returns them tagged `executable:false`.

## Cluster backends

Remediation tools talk to a `ClusterBackend`, selected at boot — the tool signatures are
identical either way:

- **sim** (default): a deterministic in-memory cluster. Bulletproof for recording.
- **kind** (`DEADMAN_CLUSTER=kind`): real `kubectl` against a local [kind](https://kind.sigs.k8s.io)
  cluster — real work, not mocked.

```sh
npm run seed:kind              # create the kind cluster + seed the OOMKill scenario
DEADMAN_CLUSTER=kind npm start # run the engine against the real cluster
```

The failing scenario (`k8s/seed.yaml`): a `checkout` deployment that OOMKills at a 256Mi
limit; `bump_memory` to ≥512Mi resolves it. `data-0` is a healthy PVC that is NOT implicated.

## Safety layers

1. **TrueForge approval gate** (primary): destructive tools carry `destructiveHint`, so a call
   is paused for a human Allow/Deny.
2. **Sensitive-target floor** (engine, defense in depth): destructive ops on protected/
   catastrophic targets are refused outright, even if approved.
3. **Audit trail**: every mutating call — executed or refused — is recorded (`get_audit_log`).

## Investigation

`investigate_incident` derives the root cause from **live signals** (memory limit, restart
counts, OOMKill status) via the active backend — the diagnosis changes when the cluster does.

Optionally, Claude narrates the prose (root cause / report / summary) grounded in that same
evidence, while the numeric fields stay deterministic:

```sh
# mcp/.env  (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
```

- On automatically when `ANTHROPIC_API_KEY` is present; falls back to the deterministic
  write-up on any missing key, refusal, or error.
- `DEADMAN_LLM_NARRATION=off` forces deterministic (recommended for a repeatable recording).
- `DEADMAN_LLM_MODEL` overrides the model (default `claude-opus-4-8`).

## Status

- ✅ Full tool surface, gate annotations, sim **and** live kind backend, safety floor, audit
  trail, live+narrated investigation, runbook, unit tests + CI.

The output contracts don't change when a backend or narration is swapped — only the tool bodies.
