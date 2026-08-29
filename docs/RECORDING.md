# Recording the agent demo (real cluster)

A runbook for recording DEADMAN working a **real** incident on the live `kind-deadman`
cluster, driven by the **real TrueForge agent** through the human-approval gate. For the
deterministic sim walkthrough, see [DEMO.md](DEMO.md).

## What is already set up

- Real `kind-deadman` cluster with the genuine failing scenario: deployment `checkout` in
  namespace `prod` is OOMKilled at a **256Mi** limit (148 restarts), and `data-0` is a healthy
  PVC that is not implicated (the wrong, irreversible fix the agent should decline).
- The engine reads this cluster correctly in kind mode (`backend:kind`, `healthy:false`,
  `memLimitMib:256`).
- RCA narration is on automatically in non-demo mode (the `ANTHROPIC_API_KEY` in
  `packages/engine/.env` is picked up).

## Steps

### 1. Point the engine at the real cluster

In the engine terminal (it is currently on the sim/demo backend on `:9000`), stop it and run:

```sh
cd packages/engine
KUBECONFIG=~/.kube/config DEADMAN_CLUSTER=kind pnpm start
```

Confirm:

```sh
curl localhost:9000/healthz
# -> {"ok":true,"backend":"kind","demo":false,"narration":true,...}
```

### 2. Open the cockpit

`http://localhost:5173/app` proxies to `:9000`, so it now shows the real `checkout` unhealthy at
256Mi with 148 restarts. Good live backdrop for the recording.

### 3. Start TrueForge and register the engine

Start TrueForge (your Docker setup). Then Settings, Connectors, Add MCP Server:

- URL: `http://host.docker.internal:9000/mcp`
- Auth: None, name `deadman`
- Load the agent definition `packages/engine/agent.deadman.json`.

### 4. Paste the alert and record

> PagerDuty SEV-2: deployment `checkout` in namespace `prod` is down. Pod is CrashLoopBackOff
> (148 restarts), last state OOMKilled. Customers are getting 5xx at checkout. Investigate and
> remediate.

### 5. The beats you will get (all real)

1. **Triage** decides real vs noise. This is a real incident.
2. **Investigate** (`investigate_incident`) gives the root cause from real signals: OOMKilled, the
   256Mi limit is too low, 148 restarts. LLM-narrated.
3. **Propose** (`propose_remediation`) lists: `restart_pod` (SAFE, does not fix the limit),
   `bump_memory` to 512 (GATED, the real fix), `delete_pvc data-0` (GATED, wrong, `data-0` is not
   implicated), `delete_primary_database` (HARDLINE, not callable).
4. The agent calls `bump_memory(checkout, 512)`. It carries `destructiveHint`, so **TrueForge
   pauses for Allow/Deny**. Deny once to show it obeys, then re-run and Allow.
5. On **Allow**, the engine runs a real `kubectl patch`. The `checkout` limit becomes 512Mi and
   the pod restarts and recovers in about 30 to 90 seconds.
6. **Verify** (`verify_resolution`) reports healthy, incident **resolved**. Confirm on screen with
   `kubectl -n prod get pod -l app=checkout` (Running).
7. Nudge it toward deleting the primary database or draining the last node. Both are **refused
   outright** (HARDLINE / last-schedulable-node floor).

## Honest caveats: the real run is leaner than the sim

- **Sandbox rehearsal is sim-only.** On kind, `rehearse_remediation` returns `rehearsed:false`
  (you cannot fork a live cluster in-process), so the "rehearsal PASS" badge will not appear.
- **Change-correlation is thinner on kind.** The rollout history has no change-cause metadata, so
  the "suspected change" card may not name the memory-limit decrease the way the sim does.
- **No live working-set percentage.** A crashing pod has no metrics window, so the RCA leans on
  the OOMKill signal and the restart count, not a memory percentage.
- **The first Allow really patches prod.** To re-take, reset the scenario:

```sh
KUBECONFIG=~/.kube/config kubectl -n prod set resources deploy/checkout --limits=memory=256Mi
# or re-seed from scratch:
pnpm --filter deadman-mcp run seed:kind
```

## Suggested cut

Record the headline on the real cluster: fix prod, the human gate (Deny then Allow), verify, and
a HARDLINE refusal. That is the money shot and it is genuinely real. If you also want the
rehearsal-PASS and suspected-change cards on camera, capture those from the sim demo mode, since
those are fixtures the sim is built to show. That gives you both the real fix and the rich cards.
