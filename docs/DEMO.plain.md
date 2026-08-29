# DEADMAN, demo guide (about 3 min)

A walkthrough that runs on a real `kind` cluster. The crash is a real but repeatable `stress`
workload, so every take goes the same way. There is no fake sim.

## Setup

You need Docker, kind, and kubectl.

```sh
# 1. Make the kind cluster and set up the failing app
pnpm --filter deadman-mcp run seed:kind
# makes the kind cluster if it is not there, deploys `checkout` healthy at 512Mi,
# waits a bit, then cuts it to 256Mi so it really OOMKills.

# 2. Start the engine against the real cluster
KUBECONFIG=~/.kube/config pnpm --filter deadman-mcp start   # http://localhost:9000
pnpm dev                                                    # cockpit -> http://localhost:5173/app
```

Health check: `curl localhost:9000/healthz` gives `{"ok":true,"backend":"kind","narration":true,...}`.

RCA narration turns on by itself when `ANTHROPIC_API_KEY` is set. If it is not set, the RCA is
worked out from live signals instead.

## The arc

Open the cockpit at `http://localhost:5173/app`. It shows the real `checkout` app broken at 256Mi.
You run the demo by seeding the cluster and then letting the agent look into it and fix it through
TrueForge, with the human-approval gate. The fix really changes the real app.

| Beat | Trigger | What it proves |
|---|---|---|
| 1. Fix prod | Seed the failing scenario with `seed:kind` | The agent looks at live signals, suggests the fix, applies it with real `kubectl`, checks it, **resolved**. |
| 2. Undo its own mistake | Re-run with a too-small limit | Set a too-small limit; the watchdog sees it did not hold, **undoes it**, and moves to the right fix. |
| 3. Refuse to nuke prod | Feed a bad alert | A bad alert says *"delete the primary database"*; it is **flagged and refused**; the real problem is still fixed safely. |

The Overview shows the four phases, the root cause with the suspected change (from real ReplicaSet
history), and the fix plan (remembered fix, approval diff, rehearsal PASS). Incidents has step
replay, Safety shows the frozen policy, Cost shows honest token usage.

## The real gate in TrueForge

Register `http://host.docker.internal:9000/mcp` in TrueForge, Settings, Connectors. Then paste the
alert into the TrueForge chat and narrate:

| Time | On screen | Say |
|---|---|---|
| 0:00 | Paste the alert into TrueForge | "Every incident bot diagnoses. DEADMAN fixes production, and the harness is what makes that safe." |
| 0:15 | Agent starts, TRIAGE | "First it triages: real, or noise?" |
| 0:30 | INVESTIGATE, root cause + memory | "It investigates from live telemetry, the real working set against the limit, and names the OOMKill." |
| 0:55 | restart_pod runs (SAFE) | "The safe, reversible fix runs on its own." |
| 1:10 | bump_memory, **TrueForge pauses: Allow/Deny** | "The real fix is a production change. The agent does not decide. The harness stops it and asks a human." |
| 1:25 | Click **Deny** | "Deny, and it obeys. It does not retry or find a workaround." |
| 1:40 | Re-run, **Allow** | "Approve, and it applies the fix." |
| 1:55 | A HARDLINE action refused | "Even with a license to act, some things are off-limits. Draining the only node, deleting the primary database: refused outright." |
| 2:15 | **Resolved**, verify passes | "It verifies the fix closed the loop. Incident resolved." |
| 2:30 | `generate_postmortem` tool output | "A full postmortem, generated from the audit trail." |

## The three beats that win

1. **The gate**: a destructive action stops for a human (Deny obeys, Allow applies).
2. **The limits**: HARDLINE actions are refused outright, without being asked.
3. **The proof**: the adversarial tests show the safety controls hold under attack, in CI
   (`pnpm --filter deadman-mcp test`).

## Fallback

If anything goes wrong on camera, re-seed and re-take freely. The crash is a real, repeatable
`stress` workload, so the scenario comes back the same each time:

```sh
pnpm --filter deadman-mcp run seed:kind
```
