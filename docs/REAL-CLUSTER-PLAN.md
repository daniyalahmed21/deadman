# Making the demo features real on a live cluster

A plan to turn the "demo dressing" (seeded / sim-only cards) into things that actually work on
the real kind cluster. Every mechanism below was researched against the official Kubernetes docs
and uses only verified `kubectl` commands.

**Guiding rule:** for each feature, either (1) make it real, or (2) label/hide it on the real
run. And a cross-cutting rule: **the sim must never tell a more flattering story than reality**
(e.g. the sim should also show "usage unavailable" during a crash, not a pretty number).

---

## 1. Real approval preview (diff + validity) — do this first

**Today:** `preview.ts` hand-authors the `rawDiff` and `warnings`. Fake.

**Real mechanism:**
- `kubectl diff -f -` returns a true unified diff of live-vs-would-be (it runs a server-side
  dry-run under the hood). Exit code 1 means "differences found" (not an error), so we need a
  diff-aware runner.
- `kubectl apply --dry-run=server -f -` runs the full admission chain (schema, ResourceQuota,
  LimitRange, webhooks) without persisting. A 403 = the change would be rejected; surface its
  message as a real warning.

**Change:** add a stdin-aware runner and a `previewChange(deployment, mutate)` method to the kind
backend; read the live deployment JSON, apply the field change in-process, pipe to `diff` and
`apply --dry-run=server`. Wire it into `preview.ts` for `bump_memory` and `scale_deployment`.

**Caveats:** treat `diff` exit 1 as success-with-output; Windows needs a `diff` binary or
`KUBECTL_EXTERNAL_DIFF`; dry-run is skipped by webhooks that don't declare `sideEffects: None`
(non-issue on kind).

**Effort:** small (a few hours). **Value:** high — this is literally the "approve with context."

Docs: kubectl reference; `apiserver-dry-run-and-kubectl-diff` blog; ResourceQuota; LimitRange.

---

## 2. Real change-correlation — half a day

**Today:** the math in `correlate.ts` is fine. The problem is the **seed**: the kind cluster has
one revision, no memory decrease, no change-cause, so there is nothing to find.

**Real mechanism:** Deployment history lives in its ReplicaSets. Each Pod-template change makes a
new ReplicaSet stamped with `deployment.kubernetes.io/revision`; its `creationTimestamp` is the
"when." The human "why" is the `kubernetes.io/change-cause` annotation (the old `--record` flag is
deprecated; set it explicitly per change).

**Change:**
- Rewrite `seed-kind.sh` to do a genuine two-step rollout: revision 1 at 512Mi (healthy),
  `sleep` a tunable gap, then revision 2 at 256Mi (the smoking gun), each with a real
  `kubectl annotate ... kubernetes.io/change-cause=...`. Now two real ReplicaSets exist with a
  real timestamp gap and a real memory decrease.
- Harden `changeHistory()` in kind.ts: filter ReplicaSets by owner/label (not name prefix) and
  read the `change-cause` into the event summary so the suspect line can quote the human reason.

**Caveats:** pure `kubectl scale` (replicas) creates no revision, so replica changes are invisible
to this method (a known blind spot). `revisionHistoryLimit` defaults to 10 (old revisions are GC'd).

**Effort:** ~half a day. **Value:** high — makes the "suspected change" card real on kind.

Docs: Deployments; update-deployment-rolling; rollout history reference; labels-annotations.

---

## 3. Honest memory numbers — ~1.5 to 2 days

**Today:** kind returns `workingSetMib: 0` for a crashing pod (real, but reads as "uses no
memory"); the sim hardcodes `451`/`348` so it looks truthful. They diverge exactly where it matters.

**Real mechanism / honest truth:** metrics-server only samples *running* containers (default 60s
resolution) and keeps no history, so a CrashLoop/OOM pod genuinely has no live number. The honest
signals are: `reason: OOMKilled` at the 256Mi limit proves demand is **> 256Mi** (a lower bound,
not a point value); the real working set becomes readable **after** the fix (kind can deliver
this); and a VPA in `updateMode: "Off"` gives a recommended target from history (optional, needs a
few minutes to populate).

**Change:**
- Distinguish "no metrics" from "0Mi" (nullable working set) — the single most important honesty fix.
- Report the OOM lower bound as the pre-fix claim ("needs > 256Mi").
- Poll `kubectl top` for ~1–2 min after the fix so `verify_resolution` shows the real post-fix usage.
- Make the **sim mirror this shape**: return null + "needs > 256Mi" while failing, real-ish number
  after the fix — so demo and real tell the same story.
- Optional stretch: VPA recommend-only for a real "target ~Xi" number.

**Effort:** ~1.5–2 days (min), ~3 with VPA. **Value:** high honesty; removes the biggest fib.

Docs: resource-metrics-pipeline; manage-resources-containers; pod-lifecycle; VPA; metrics-server FAQ.

---

## 4. Real sandbox rehearsal — ~1 day (with honest limits)

**Today:** sim-only; kind returns `rehearsed:false`.

**Real mechanism:** server dry-run gate, then clone the Deployment into a throwaway namespace at
the proposed limit (1 replica), watch for an OOM over a ~60–90s window, then delete the namespace.
This is the only faithful test because the real kubelet enforces the cgroup limit.

**Change:** add `rehearseInNamespace()` to the kind backend (fetch spec as JSON, strip identity
fields + status, set the new namespace + fixed limit + 1 replica, dry-run, apply, `rollout status`,
read restartCount / `lastState.terminated.reason`, then `kubectl delete namespace --wait=false`).
Delegate to it from `rehearse.ts` for `bump_memory` on kind; keep the honest `rehearsed:false`
otherwise.

**Caveats (must be said in the output):** the clone gets **no real traffic**, so a PASS at 512Mi
under idle load is not proof it survives prod load; missing `imagePullSecret` / external deps in
the temp namespace can cause false failures; the doubled workload can pressure a single-node kind.

**Effort:** ~1 day. **Value:** medium — note the watchdog already guarantees the after-the-fact
version of this on kind, so rehearsal is a *preview* of something already covered.

Docs: Namespaces; apiserver-dry-run blog; assign-memory-resource; manage-resources-containers.

---

## 5. Smaller honesty fixes — alongside the above

- **Recall / incident memory:** persist the store to disk so it survives restarts and grows for
  real as incidents resolve; label the seeded `INC-24xx` entries as "historical examples" (or start
  empty on kind). Small.
- **Seeded views + cost:** when `backend:kind`, do not render the seeded history/plan cards as if
  live; show real or empty. Only show a cost figure when narration is actually on. Small.

---

## Suggested order

1. Real preview (small, high value, low risk).
2. Real change-correlation via the seed rewrite (half a day, makes a headline card real).
3. Honest memory numbers + sim mirroring (removes the biggest fib; makes sim match reality).
4. Real ephemeral-namespace rehearsal (optional; the watchdog already covers the real risk).
5. Recall persistence + gating seeded cards in kind mode (small, alongside).

Rough total to "no demo trash": about **3 to 4 days**, or ~2 days if rehearsal and VPA are deferred.
All commands verified against kubernetes.io.
