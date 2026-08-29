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

## What is now real on kind (was sim-only)

These used to be sim-only or seeded. They now work on the real cluster, so seed with the updated
`seed:kind` first (it records a real change-cause and a genuine 512Mi->256Mi cut):

- **Sandbox rehearsal is real.** `rehearse_remediation` clones `checkout` into a throwaway
  namespace at the proposed limit, watches it under real cgroup enforcement, and reports PASS/FAIL
  (verified: 512Mi passes, 256Mi OOMKills). Takes ~15-45s. Honest caveat: idle load only, not a
  production load test, so a PASS is "did not OOM at rest," not "proven under peak traffic."
- **Change-correlation is real.** The seed records a real `kubernetes.io/change-cause`, so the
  suspected-change card names the actual `mem limit 512Mi -> 256Mi (cost-saving...)` from the real
  ReplicaSet history.
- **Recall is honest.** On kind it starts empty (no seeded `INC-24xx`) and grows durably from
  incidents this cluster actually resolves.
- **Approval preview is real.** The diff comes from `kubectl diff` and warnings from a server
  dry-run plus a live ResourceQuota headroom check.

## Remaining honest caveats

- **No live working-set percentage during the crash.** A crashing pod has no metrics window, so
  the RCA honestly leans on the OOMKill signal and restart count, not a memory percentage. The
  real number is readable after the fix.
- **The first Allow really patches prod.** To re-take, reset the scenario:

```sh
KUBECONFIG=~/.kube/config kubectl -n prod set resources deploy/checkout --limits=memory=256Mi
# or re-seed from scratch (rebuilds the real change history):
pnpm --filter deadman-mcp run seed:kind
```

## Suggested cut

The whole arc is now genuinely real on kind: the suspected change, the rehearsal PASS, the human
gate (Deny then Allow), the real `kubectl` fix, verify, and a HARDLINE refusal. Lead with all of
it. The only thing the sim still shows that kind cannot is a live memory percentage during the
crash, which is an honest limitation, not a missing feature.
