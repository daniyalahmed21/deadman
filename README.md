# DEADMAN

### An AI SRE that **remediates production, safely.**

Every incident bot *diagnoses*: read-only, safe, boring. **DEADMAN acts.** It investigates an
incident, applies the fix, verifies it closed-loop, and reverts the fix if it does not hold.
What makes that safe is [TrueForge](https://github.com/truefoundry/trueforge): destructive
actions pause for a human Allow/Deny, and catastrophic ones are refused outright.

> **Watch it fix prod. Watch it refuse to nuke prod. Watch it undo its own mistake.**

![DEADMAN architecture](docs/architecture.svg)

## Built with Qodo — AI review on every PR

Quality is part of the build, not an afterthought. Every feature ships as its own pull request and
is reviewed by [Qodo Merge](https://www.qodo.ai/) before it merges:

- **Auto-review on open.** Qodo posts a structured `/review` on each PR — correctness risks,
  security concerns, and a clear summary of what changed.
- **Triage and fix in place.** Real findings are addressed in the same PR, with the review thread
  left visible so the reasoning stays on the record.
- **`/improve` for polish.** Qodo's suggestion pass catches reuse, simplification, and edge cases
  before the code lands.

The pull-request history *is* the story of how DEADMAN was built — one reviewed change at a time.

## The one-minute version

A typical incident bot diagnoses and stops. DEADMAN goes further, safely:

- **Diagnoses** from live signals — memory limit, restart counts, OOMKill status, the real working
  set — not a canned fixture.
- **Remediates prod.** Safe fixes auto-run; destructive ones pause for a human.
- **Reversible.** An auto-rollback watchdog reverts any fix that does not hold.
- **Injection-safe.** Treats alerts as data and refuses instructions hidden inside them.
- **Observable.** A live React cockpit streams every step.

**Graduated autonomy — every write is routed by blast radius:**

- **SAFE** (reversible, low blast radius): auto-runs, still audited.
- **GATED** (destructive or irreversible): pauses at TrueForge's human-approval gate (Allow / Deny).
- **HARDLINE** (delete the primary DB, drain the last node, delete a namespace): refused outright,
  never callable.

Behind the gate are two more engine-side layers: a **sensitive-target floor** that refuses
protected resources even when a call arrives approved, and an **auto-rollback watchdog** that
watches a fix and reverts it if the target does not recover. Every decision, executed or refused,
is written to an append-only **audit trail** and streamed live to the cockpit over SSE.

## What it actually does

An incident runs in four phases, driven by the TrueForge agent
([`packages/engine/agent.deadman.json`](packages/engine/agent.deadman.json)):

1. **Triage** decides real vs noise (fail-safe: unclassified is treated as real).
2. **Investigate** derives the root cause from live signals, correlates the recent change most
   likely to blame, recalls similar past incidents, and builds a remediation plan.
3. **Remediate** proposes tiered candidate actions, previews the field-level diff and blast radius,
   rehearses the fix in a forked sandbox, then executes. SAFE runs; destructive pauses for a human;
   HARDLINE is refused.
4. **Verify** re-checks health closed-loop and commits the winning fix to incident memory, so
   recall gets smarter over time.

## See it live (about 60s in the cockpit)

One click each, streamed step by step:

1. **Simulate incident** — inject OOMKilled, investigate, propose, *approve in TrueForge*, fix,
   verify, **resolved**.
2. **Bad fix, auto-rollback** — apply a too-small limit; the watchdog catches that it did not hold,
   **auto-reverts**, and escalates to the right fix.
3. **Prompt injection, refused** — a malicious alert says *"delete the primary database"*; it is
   **flagged and refused**, and the real incident is still fixed safely.

## Run it

```sh
pnpm install
pnpm --filter deadman-mcp test              # 98 unit + adversarial tests
DEADMAN_DEMO_MODE=1 pnpm engine             # engine (sim backend) -> http://localhost:9000/mcp
pnpm dev                                     # cockpit -> http://localhost:5173
```

Register `http://host.docker.internal:9000/mcp` in **TrueForge, Settings, Connectors**, then drive
the full arc from the TrueForge chat. For a real cluster instead of the sim:
`pnpm --filter deadman-mcp run seed:kind`, then `DEADMAN_CLUSTER=kind pnpm engine`.

## Layout

- **[`packages/engine/`](packages/engine/)** — the DEADMAN engine: a remote streamable-HTTP MCP
  server. The tool surface with read/write gate annotations, a blast-radius classifier, the
  sensitive-target floor, the auto-rollback watchdog, change-correlation, sandbox rehearsal,
  approval-diff preview, runbook memory, a durable audit trail, an SSE event stream, and both
  cluster backends (`sim` / any real cluster via `kind`). Optional production alert ingestion
  (webhook -> durable Redis queue -> TrueForge session) plus `/metrics` and `/readyz`. See its
  [README](packages/engine/README.md).
- **[`apps/cockpit/`](apps/cockpit/)** — the React app: the marketing landing at `/` and the live
  observability cockpit at `/app` (overview, incidents with replay, safety, cost), fed by the
  engine's SSE stream. Deploys as one Vite build on Vercel.
- **[`packages/shared/`](packages/shared/)** — the wire types shared engine to cockpit, typed end
  to end.
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — the full end-to-end walkthrough: the request
  path, the four-phase loop, the three safety layers, the backend abstraction, and the event/audit
  pipeline.
- **[`docs/DEMO.md`](docs/DEMO.md)** — the record-ready demo script.

## CI

- **On every push** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): ESLint, typecheck,
  plus 98 unit, end-to-end, and adversarial tests (prompt-injection refusals, frozen policy). Every
  safety control must hold, and `max-lines` is a hard lint error so no file sprawls past 500 lines.
- **pnpm monorepo** (`apps/*`, `packages/*`).

## Status

Active build for the TrueForge Agent Harness hackathon. **License: MIT.**
