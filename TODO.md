# DEADMAN — TODO

Progress is tracked here and checked off in the same commit that lands the work.

## MCP engine
- [x] Streamable-HTTP MCP transport + server bootstrap
- [x] Full tool surface with read/write gate annotations
- [x] Blast-radius classifier (SAFE / GATED / HARDLINE, fail-closed)
- [x] Deterministic in-memory cluster (closed-loop `verify_resolution`)
- [x] Smoke test: tools list, gate flags, closed-loop verify
- [ ] Swap `investigate_incident` canned result for the live investigation call
- [ ] Point remediation tools at a real cluster (keep the sim as fallback)
- [ ] Self-validate tool inputs; reject unknown/oversized payloads

## TrueForge integration
- [x] Register the MCP server as a remote HTTP connector
- [x] Confirm destructive tools auto-gate — LIVE: agent's `bump_memory` call halted with
      `tool.approval_required`; Deny → agent obeys (no retry); Allow → fix applies
- [x] DEADMAN agent spec (approval gate, dynamic subagents, ask_user)
- [x] Live end-to-end: investigate → dry_run → safe restart → gated fix →
      verify → resolved; HARDLINE refused; uninvolved PVC left alone
- [ ] Runbook skill (decision rules loaded at runtime)
- [ ] Generative-UI approval card (diff + blast radius + rollback)
- [ ] Closed-loop verify + session resume

## Safety depth
- [ ] Consecutive-denial circuit breaker
- [ ] Freeze safety policy at startup (injection-proof)
- [ ] Structured, redacted audit records

## Demo
- [ ] Seed the failure scenario end-to-end
- [ ] Rehearse + record the 3-minute demo
