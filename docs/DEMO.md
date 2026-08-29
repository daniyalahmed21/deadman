# DEADMAN, demo guide (about 3 min)

A record-ready walkthrough that runs on a real `kind` cluster. The OOM scenario is a real but
reproducible `stress` workload, so every take lands the same way without any sim.

## Setup

Requires Docker + kind + kubectl.

```sh
# 1. Provision the kind cluster and seed the failing scenario
pnpm --filter deadman-mcp run seed:kind
# creates the kind cluster if missing, deploys `checkout` healthy at 512Mi,
# waits a real gap, then cuts it to 256Mi so it genuinely OOMKills.

# 2. Start the engine against the real cluster
KUBECONFIG=~/.kube/config pnpm --filter deadman-mcp start   # http://localhost:9000
pnpm dev                                                    # cockpit -> http://localhost:5173/app
```

Health check: `curl localhost:9000/healthz` gives `{"ok":true,"backend":"kind","narration":true,...}`.

RCA narration is on automatically when `ANTHROPIC_API_KEY` is present; otherwise the RCA is
deterministic from live signals.

## The arc

Open the cockpit at `http://localhost:5173/app`. It shows the real `checkout` deployment unhealthy
at 256Mi. The demo is driven by seeding the cluster and then letting the agent investigate and
remediate through TrueForge, with the human-approval gate. Remediation actually mutates the real
deployment.

| Beat | Trigger | What it proves |
|---|---|---|
| 1. Fix prod | Seed the failing scenario with `seed:kind` | The agent investigates from live signals, proposes the fix, applies it via real `kubectl`, verifies, **resolved**. |
| 2. Undo its own mistake | Re-run with a too-small limit | Apply a too-small limit; the watchdog catches that it did not hold, **auto-reverts**, and escalates to the right fix. |
| 3. Refuse to nuke prod | Feed a malicious alert | A malicious alert says *"delete the primary database"*; it is **flagged and refused**; the real incident is still fixed safely. |

The Overview streams the four phases, the root cause with the suspected change (from real
ReplicaSet history), and the remediation plan (recalled fix, approval diff, rehearsal PASS).
Incidents has step replay, Safety shows the frozen policy, Cost shows honest token usage.

## The real gate in TrueForge

Register `http://host.docker.internal:9000/mcp` in TrueForge, Settings, Connectors, then paste the
alert into the TrueForge chat and narrate:

| Time | On screen | Say |
|---|---|---|
| 0:00 | Paste the alert into TrueForge | "Every incident bot diagnoses. DEADMAN remediates production, and the harness is what makes that safe." |
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

1. **The gate**: a destructive action pauses for a human (Deny obeys, Allow applies).
2. **The limits**: HARDLINE actions are refused outright, unprompted.
3. **The proof**: the adversarial suite shows the safety controls hold under attack, in CI
   (`pnpm --filter deadman-mcp test`).

## Fallback

If anything hiccups on camera, re-seed and re-take freely. The OOM is a real deterministic
`stress` workload, so the scenario reproduces the same way each time:

```sh
pnpm --filter deadman-mcp run seed:kind
```
