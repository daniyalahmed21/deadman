# DEADMAN

### An AI SRE that **fixes production, safely.**

Most incident bots only *diagnose*. That is read-only, safe, and a little boring. **DEADMAN
acts.** It looks into an incident, applies the fix, checks that the fix worked, and undoes the
fix if it does not hold. What keeps that safe is [TrueForge](https://github.com/truefoundry/trueforge):
anything destructive stops for a human to Allow or Deny, and the worst actions are refused
outright.

> **Watch it fix prod. Watch it refuse to nuke prod. Watch it undo its own mistake.**

![DEADMAN architecture](docs/architecture.svg)

---

## The one-minute version

| | Typical incident bot | **DEADMAN** |
|---|---|---|
| **Diagnoses** | yes | yes, from live signals, not a canned fixture |
| **Fixes prod** | no | yes, safe fixes run on their own, destructive ones need approval |
| **Reversible** | no | yes, a watchdog undoes a fix that does not hold |
| **Injection-safe** | no | yes, it treats alerts as data and ignores instructions hidden in them |
| **Observable** | logs | yes, a live React cockpit that streams every step |

**Graduated autonomy. Every write is sorted by how much damage it could do:**

- **SAFE** (reversible, small blast radius): runs on its own, still recorded.
- **GATED** (destructive or irreversible): stops at TrueForge's approval gate for a human (Allow / Deny).
- **HARDLINE** (delete the primary DB, drain the last node, delete a namespace): refused outright, never even callable.

Behind the gate are two more checks inside the engine: a **sensitive-target floor** that refuses
protected resources even when a call comes in approved, and an **auto-rollback watchdog** that
watches a fix and undoes it if the target does not recover. Every decision, whether it ran or was
refused, is written to a permanent **audit trail** and streamed live to the cockpit over SSE.

## What it actually does

An incident runs in four phases, driven by the TrueForge agent
([`packages/engine/agent.deadman.json`](packages/engine/agent.deadman.json)):

1. **Triage** decides real vs noise. If it cannot tell, it treats the alert as real, so nothing
   is dropped by accident.
2. **Investigate** works out the root cause from live signals (memory limit, restart counts,
   OOMKill status, the real working set), points at the recent change most likely to blame,
   remembers similar past incidents, and builds a fix plan.
3. **Remediate** lists candidate actions by tier, previews the exact diff and blast radius,
   rehearses the fix in a copy of the cluster, then runs it. SAFE runs; destructive stops for a
   human; HARDLINE is refused.
4. **Verify** re-checks health, and saves the winning fix to memory so recall gets smarter next
   time.

## See it live (about 60s in the cockpit)

One click each, streamed step by step:

1. **Simulate incident**: inject OOMKilled, investigate, propose, *approve in TrueForge*, fix,
   verify, **resolved**.
2. **Bad fix, auto-rollback**: apply a too-small limit, the watchdog notices it did not hold,
   **undoes it**, and moves to the right fix.
3. **Prompt injection, refused**: a malicious alert says *"delete the primary database"*, it is
   **flagged and refused**, and the real incident is still fixed safely.

## Run it

```sh
pnpm install
pnpm --filter deadman-mcp test              # 68 unit + adversarial tests
DEADMAN_DEMO_MODE=1 pnpm engine             # engine (sim backend) -> http://localhost:9000/mcp
pnpm dev                                     # cockpit -> http://localhost:5173
```

Register `http://host.docker.internal:9000/mcp` in **TrueForge, Settings, Connectors**, then run
the whole thing from the TrueForge chat. To use a real cluster instead of the sim:
`pnpm --filter deadman-mcp run seed:kind`, then `DEADMAN_CLUSTER=kind pnpm engine`.

## Layout

- **[`packages/engine/`](packages/engine/)** the DEADMAN engine: a remote streamable-HTTP MCP
  server. It holds the tool surface with read/write gate labels, the blast-radius classifier, the
  sensitive-target floor, the auto-rollback watchdog, change-correlation, sandbox rehearsal, the
  approval-diff preview, runbook memory, a permanent audit trail, an SSE event stream, and both
  cluster backends (`sim` / `kind`). See its [README](packages/engine/README.md).
- **[`apps/cockpit/`](apps/cockpit/)** the React app: the marketing landing at `/` and the live
  cockpit at `/app` (overview, incidents with replay, safety, cost), fed by the engine's SSE
  stream. Deploys as one Vite build on Vercel.
- **[`packages/shared/`](packages/shared/)** the wire types shared by the engine and the cockpit,
  typed end to end.
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** the full walkthrough: the request path, the
  four-phase loop, the three safety layers, the backend split, and the event/audit pipeline.
- **[`docs/DEMO.md`](docs/DEMO.md)** the record-ready demo script.

## Development and quality

- **AI code review on every PR**: pull requests are auto-reviewed by
  [Qodo Merge](https://www.qodo.ai/) (comment `/review`). Real findings are fixed before merge.
- **CI on every push** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): typecheck plus
  68 unit, end-to-end, and adversarial tests (prompt-injection refusals, frozen policy). Every
  safety control has to hold.
- **pnpm monorepo** (`apps/*`, `packages/*`).

## Status

Active build for the TrueForge Agent Harness hackathon. **License: MIT.**
