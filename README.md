# DEADMAN

An AI SRE with a **license to act** on production.

Every incident bot *diagnoses* — read-only, safe, boring. DEADMAN **remediates**: it
investigates an incident, proposes fixes, and then acts. The safety model is graduated
autonomy:

- **Reversible, low-blast-radius** actions (e.g. rollout-restart) auto-execute.
- **Irreversible / destructive** actions hard-stop at a **human-approval checkpoint** with a
  diff + rollback card before anything is touched.
- **Catastrophic** actions (delete the primary database, drop a namespace) are **refused
  outright** — a license to act has limits.

Dry-run first, closed-loop verify after, full audit trail.

Built to run on [TrueForge](https://github.com/truefoundry/trueforge) — the harness owns the
visible safety (the approval pause on destructive tools), which is the whole point.

## What works today

- **Investigate** — grounded root-cause analysis from live signals (memory limit, restart
  counts, OOMKill status), not a fixture. The diagnosis changes when the cluster changes.
- **Graduated autonomy** — safe fixes auto-run; destructive ones pause at TrueForge's
  approval gate (`destructiveHint`); catastrophic ones are refused outright.
- **Two cluster backends** — a deterministic in-memory `sim` (default) and a real `kind`
  cluster driven by `kubectl` (`DEADMAN_CLUSTER=kind`). Same tools either way.
- **Runbook-aware** — `get_runbook` supplies the decision rules the agent follows.
- **Defense in depth** — a sensitive-target floor refuses destructive ops on protected
  resources even if approved; every mutating call is recorded in an audit trail.
- **Verified live end-to-end** — agent → approval gate → real `kubectl` → cluster fixed
  (256Mi→512Mi, pod Running), confirmed by independent `kubectl`. Sessions persist (resume).

## Layout

- **`mcp/`** — the DEADMAN engine, a remote HTTP MCP server (streamable-HTTP): the tool
  surface with read/write gate annotations, blast-radius classifier, sensitive-target floor,
  audit trail, runbook, and both cluster backends. See [`mcp/README.md`](mcp/README.md).
- **`demo.sh`** — one-command end-to-end demo (incident → gate → approve → fix → verify).
- **`.github/workflows/ci.yml`** — typecheck + unit tests on every push.

## Quick start

```sh
cd mcp && npm install
npm test                       # 20 unit tests
npm start                      # sim backend  -> http://localhost:9000/mcp
# or, against a real cluster:
npm run seed:kind              # create kind cluster + seed the OOMKill scenario
DEADMAN_CLUSTER=kind npm start
```

Register `http://host.docker.internal:9000/mcp` in TrueForge → Settings → Connectors, then:

```sh
bash demo.sh                   # drive the full arc against TrueForge + the MCP server
```

## Testing

- **Unit** (`npm test`): classifier tiers, sensitive-target floor, cluster sim, audit, RCA
  synthesis, runbook — run in CI on every push.
- **Integration** (`node mcp/scripts/smoke.mjs`): the live tool surface over MCP.
- **End-to-end** (`demo.sh`): the agent resolving a real incident through the approval gate.

## Status

Active developer build. Progress tracked in [`TODO.md`](TODO.md).

## License

MIT
