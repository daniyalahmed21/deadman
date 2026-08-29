# DEADMAN

### An AI SRE that **fixes production, safely.**

Most incident bots only tell you what's wrong. That's read-only, safe, and boring. **DEADMAN
actually fixes it.** It looks into the incident, applies a fix, checks that the fix worked, and
undoes the fix if it doesn't hold. What keeps this safe is
[TrueForge](https://github.com/truefoundry/trueforge): risky actions stop and wait for a person to
click Allow or Deny, and the most dangerous ones are blocked completely.

> **Watch it fix prod. Watch it refuse to nuke prod. Watch it undo its own mistake.**

![DEADMAN architecture](docs/architecture.svg)

## Built with Qodo - AI review on every PR

We build quality in from the start, not bolt it on later. Each feature goes out as its own pull
request, and [Qodo Merge](https://www.qodo.ai/) reviews it before it's merged:

- **Reviewed the moment it opens.** Qodo posts a `/review` on every PR - bugs, security risks, and
  a plain summary of what changed.
- **Real findings fixed in the same PR.** We sort the comments, fix the ones that matter, and leave
  the thread visible so the reasoning stays on record.
- **Polished with `/improve`.** Qodo's suggestion pass catches repeated code, simpler ways to write
  things, and edge cases before the code lands.

The pull-request history *is* the story of how DEADMAN was built - one reviewed change at a time.

## The one-minute version

A typical incident bot tells you what's wrong and stops there. DEADMAN goes further, safely:

- **Finds the cause** from live data - memory limit, restart counts, OOMKill status, the real
  working set (how much memory it's actually using) - not a canned example.
- **Fixes production.** Safe fixes run on their own; risky ones stop and wait for a person.
- **Reversible.** A watchdog watches each fix and undoes it automatically if it doesn't hold.
- **Safe from injection.** It treats alerts as data and refuses any commands hidden inside them.
- **Easy to watch.** A live React cockpit shows every step as it happens.

**It earns trust step by step - every change is sorted by how much damage it could do (its blast
radius):**

- **SAFE** (reversible, low blast radius): runs on its own, but is still logged.
- **GATED** (destructive or can't be undone): stops at TrueForge's human-approval gate (Allow / Deny).
- **HARDLINE** (delete the primary DB, drain the last node, delete a namespace): blocked outright,
  never callable.

Behind the gate are two more safety layers inside the engine. A **sensitive-target floor** blocks
protected resources even when a call somehow arrives approved. An **auto-rollback watchdog** watches
a fix and undoes it if the target doesn't recover. Every decision - done or refused - is written to
an **audit trail** you can only add to, and streamed live to the cockpit over SSE (a one-way live
feed).

## What it actually does

An incident runs in four phases, driven by the TrueForge agent
([`packages/engine/agent.deadman.json`](packages/engine/agent.deadman.json)):

1. **Triage** decides if the alert is real or just noise. If it can't tell, it treats it as real, to
   be safe.
2. **Investigate** works out the root cause from live data, picks the recent change most likely to
   blame, remembers similar past incidents, and builds a fix plan.
3. **Remediate** suggests possible actions sorted by risk, shows the exact field-level changes and
   the blast radius, rehearses the fix in a throwaway copy (a forked sandbox), then runs it. SAFE
   runs; destructive stops for a person; HARDLINE is refused.
4. **Verify** checks the health again to confirm the fix worked, and saves the winning fix to
   incident memory, so recall gets smarter over time.

## See it live (about 60s in the cockpit)

One click each, shown step by step:

1. **Incident** - trigger OOMKilled, investigate, propose, *approve in TrueForge*, fix,
   verify, **resolved**.
2. **Bad fix, auto-rollback** - set a limit that's still too small; the watchdog catches that it did
   not hold, **undoes it automatically**, and moves up to the right fix.
3. **Prompt injection, refused** - a malicious alert says *"delete the primary database"*; it is
   **flagged and refused**, and the real incident is still fixed safely.

## Run it

```sh
pnpm install
pnpm --filter deadman-mcp test              # 75 unit + adversarial tests
pnpm --filter deadman-mcp run seed:kind     # seed the OOMKill scenario into the kind cluster
pnpm engine                                  # engine -> http://localhost:9000/mcp
pnpm dev                                     # cockpit -> http://localhost:5173
```

Add `http://host.docker.internal:9000/mcp` in **TrueForge, Settings, Connectors**, then run the
whole flow from the TrueForge chat. The engine acts on a real cluster via the `kind` backend: a
local kind cluster for dev, or any EKS/GKE/AKS cluster selected with `KUBE_CONTEXT` +
`KUBE_NAMESPACE`. Requires a running kind cluster + kubectl.

## Layout

- **[`packages/engine/`](packages/engine/)** - the DEADMAN engine, a remote streamable-HTTP MCP
  server. It holds the tools (each tagged read or write for the gate), the blast-radius classifier,
  the sensitive-target floor, the auto-rollback watchdog, change-correlation, sandbox rehearsal,
  approval-diff preview, runbook memory, an add-only audit trail, an SSE event stream, and the
  `kind` cluster backend (real `kubectl` against a local kind cluster or any real cluster). It can also take in production alerts
  (webhook -> durable Redis queue -> TrueForge session), plus `/metrics` and `/readyz`. See its
  [README](packages/engine/README.md).
- **[`apps/cockpit/`](apps/cockpit/)** - the React app: the marketing landing at `/` and the live
  cockpit at `/app` (overview, incidents with replay, safety, cost), fed by the engine's SSE stream.
  It ships as one Vite build on Vercel.
- **[`packages/shared/`](packages/shared/)** - the data types the engine and cockpit send each
  other, typed end to end.
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** - the full walkthrough: the request path, the
  four-phase loop, the three safety layers, the backend abstraction, and the event/audit pipeline.
- **[`docs/DEMO.md`](docs/DEMO.md)** - the demo script, ready to record.

## CI

- **On every push** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): ESLint, typecheck,
  and 75 unit, end-to-end, and adversarial tests (prompt-injection refusals, frozen policy). Every
  safety control has to hold, and `max-lines` is a hard lint error, so no file grows past 500 lines.
- **pnpm monorepo** (`apps/*`, `packages/*`).

## Status

Being actively built for the TrueForge Agent Harness hackathon. **License: MIT.**
