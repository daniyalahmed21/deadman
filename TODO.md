# DEADMAN — TODO

Progress is tracked here and checked off in the same commit that lands the work.

## MCP engine
- [x] Streamable-HTTP MCP transport + server bootstrap
- [x] Full tool surface with read/write gate annotations
- [x] Blast-radius classifier (SAFE / GATED / HARDLINE, fail-closed)
- [x] Deterministic in-memory cluster (closed-loop `verify_resolution`)
- [x] Smoke test: tools list, gate flags, closed-loop verify
- [x] Unit tests (classifier, guard, cluster, audit) — 14 passing
- [x] `investigate_incident` derives RCA from LIVE signals (memory limit, restarts, OOMKill
      status) — real kubectl in kind mode; diagnosis changes when the cluster changes
- [x] Optional LLM-narrated investigation (Anthropic SDK, claude-opus-4-8, structured output)
      — on when ANTHROPIC_API_KEY present; deterministic fallback; DEADMAN_LLM_NARRATION=off
- [x] Real `kind` cluster backend (kubectl) behind a swappable interface; sim stays default
- [x] Live end-to-end on real infra: agent → gate → approved → real kubectl fix → verified
- [x] Self-validate tool inputs (typed schemas + bounds, e.g. mib <= 65536)
- [x] Live telemetry tools: `get_metrics` (metrics-server), `get_logs`, `get_events`, `get_deploy_history`
- [x] RCA grounded in real working-set numbers (metrics-server); graceful OOM-signal fallback while crashlooping

## TrueForge integration
- [x] Register the MCP server as a remote HTTP connector
- [x] Confirm destructive tools auto-gate — LIVE: agent's `bump_memory` call halted with
      `tool.approval_required`; Deny → agent obeys (no retry); Allow → fix applies
- [x] DEADMAN agent spec (approval gate, dynamic subagents, ask_user)
- [x] Live end-to-end: investigate → dry_run → safe restart → gated fix →
      verify → resolved; HARDLINE refused; uninvolved PVC left alone
- [x] Persistent sessions verified — full trajectory durably retrievable (resume)
- [x] One-command demo runner (demo.sh): reset → incident → gate → approve → fix → verify
- [ ] Runbook skill (decision rules loaded at runtime)
- [ ] Generative-UI approval card (diff + blast radius + rollback)
- [ ] Closed-loop verify + session resume

## Generative UI
- [x] Live incident cockpit at `/dashboard` — phase strip (triage→investigate→remediate→verify),
      root cause + evidence, cluster health with a live memory bar, action log with tier badges
      (SAFE/GATED/HARDLINE) and OK/REFUSED. Self-contained, same-origin, polls `/dashboard/state`.
- [x] `generate_postmortem` tool — full incident write-up from the audit trail + investigation
- [ ] Custom TrueForge-UI approval card (React slot override) — stretch
- [ ] Slack/Resend post-incident notification — follow-up

## Runbook & Skills
- [x] Runbook-aware remediation via `get_runbook` tool (OOMKill→bump memory, never delete PVC, etc.)
- [x] Native TrueForge SKILL (git-loaded `sre-runbook`) materialized in a **Daytona sandbox**
      — sandbox provider configured, agent has sandbox+skill, session shows `sandbox.created`
      with 0 errors. (Daytona snapshot build 502s transiently; setup-daytona.sh retries.)

## Chaos, scenarios & adversarial hardening
- [x] Scenario-aware investigation: OOMKill→bump_memory, CrashLoop/ImagePull→rollback_deploy
      (recommended_action per scenario; verified in sim AND on the real kind cluster)
- [x] Chaos seeder: `scripts/chaos.sh oom|crashloop|imagepull` (+ k8s/scenarios manifests);
      sim uses `DEADMAN_SCENARIO`
- [x] Adversarial suite (unit + e2e): injected "delete the prod DB" ignored; protected PVCs
      + drain-last-node refused; HARDLINE never exposed; policy frozen at import
- [x] e2e + adversarial run in CI (sim backend)

## Agent teams & remediation surface
- [x] `triage` first-pass tool (severity/noise, fail-safe to investigate)
- [x] Expanded gated remediation: `scale_deployment`, `cordon_node`, `drain_node`
- [x] Node sensitive-target floor: draining the only schedulable node → HARDLINE refused (sim + kind)
- [x] 4-phase team workflow (triage → investigate → remediate → verify) in the agent spec
- [ ] Per-subagent tool scoping demoed live in TrueForge (dynamic_sub_agents already enabled)

## Safety depth
- [x] Sensitive-target floor: engine refuses destructive ops on protected targets (defense in depth)
- [x] Freeze safety policy at startup (HARDLINE + protected patterns frozen at import)
- [x] Structured audit records (action/target/tier/before/after/outcome) via get_audit_log
- [ ] Consecutive-denial circuit breaker (harness-side; revisit)

## Cost, reliability & demo kit
- [x] Per-session cost telemetry (`scripts/cost.mjs`) — real tokens → $ + cache savings
      (measured: ~$0.09/incident, 88% prompt-cache hit)
- [x] `DEADMAN_DEMO_MODE` (deterministic sim, narration off, OOM scenario) + `/healthz`
      — one flag for a bulletproof recording
- [x] Demo kit: `docs/DEMO.md` shot-by-shot + voiceover; cockpit firing/resolved screenshots

## Demo
- [x] Seed the failure scenario end-to-end (kind + sim)
- [x] Scripted end-to-end demo (demo.sh)
- [ ] Record the 3-minute video + voiceover (human, follow docs/DEMO.md)
- [ ] Blog post (human)
