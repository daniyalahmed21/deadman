---
name: sre-runbook
description: SRE remediation decision rules for DEADMAN — when to restart vs. bump memory vs. rollback, what never to delete, and which actions are refused outright. Load before choosing a production remediation.
---

# SRE Runbook

Authoritative decision rules for remediating production incidents. Consult this before
choosing an action; prefer the smallest reversible fix and never destroy data the
investigation has not implicated.

## Symptom → action

- **OOMKilled** — Raise the container memory limit to **≥512Mi** (`bump_memory`) and
  rollout-restart. A restart alone only delays recurrence. **Never delete a PVC** — data loss
  does not fix a memory limit.
- **CrashLoopBackOff (no OOMKill)** — Inspect readiness/liveness probes and the most recent
  change. Prefer `rollback_deploy` to the last good revision over any destructive change.
- **Disk pressure / PVC full** — Expand the volume or clear reclaimable data. Never delete a
  bound PVC the investigation has not implicated.
- **High error rate after a deploy** — `rollback_deploy` to the previous revision first to
  stop the bleeding; investigate root cause off the hot path.

## Tiers

- **SAFE** (auto): `restart_pod` and all read-only tools — reversible, low blast radius.
- **GATED** (human approval): `bump_memory`, `rollback_deploy`, `delete_pvc`, `scale_to_zero`
  — destructive or irreversible; the platform pauses for Allow/Deny.
- **HARDLINE** (refused outright, no approval offered): delete a primary/only database, delete
  a namespace, terminate the last healthy replica, scale core infrastructure to zero.
  A license to act has limits.

## Rules

1. Always `dry_run` before a mutating action.
2. Execute the remediation by calling the tool directly; the approval gate handles destructive
   ones. Respect a denial — do not retry a denied action or a variant.
3. After applying a fix, call `verify_resolution` and report whether the incident is resolved.
4. Refuse HARDLINE actions outright and explain why.
