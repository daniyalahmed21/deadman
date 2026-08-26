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

## Runbook & Skills
- [x] Runbook-aware remediation via `get_runbook` tool (OOMKill→bump memory, never delete PVC, etc.)
- [x] Native TrueForge SKILL (git-loaded `sre-runbook`) materialized in a **Daytona sandbox**
      — sandbox provider configured, agent has sandbox+skill, session shows `sandbox.created`
      with 0 errors. (Daytona snapshot build 502s transiently; setup-daytona.sh retries.)

## Safety depth
- [x] Sensitive-target floor: engine refuses destructive ops on protected targets (defense in depth)
- [x] Freeze safety policy at startup (HARDLINE + protected patterns frozen at import)
- [x] Structured audit records (action/target/tier/before/after/outcome) via get_audit_log
- [ ] Consecutive-denial circuit breaker (harness-side; revisit)

## Demo
- [x] Seed the failure scenario end-to-end (kind + sim)
- [x] Scripted end-to-end demo (demo.sh)
- [ ] Rehearse + record the 3-minute demo (human, in the UI)
