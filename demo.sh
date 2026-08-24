#!/usr/bin/env bash
# One-command DEADMAN demo / integration test.
#
# Drives the full arc against a running TrueForge (:8790) + MCP server (:9000):
#   incident -> investigate -> gate on the destructive fix -> approve -> apply -> verify
# then prints the audit trail and proves the session persisted (resume).
#
# Auto-approves the gated action so it runs hands-free; in the UI a human clicks Allow/Deny.
# No `set -e`: transient curl hiccups during polling must not abort the demo.
set -uo pipefail
TF="${TRUEFORGE_URL:-http://localhost:8790}"
CTX="${KIND_CONTEXT:-kind-deadman}"

j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(eval(process.argv[1]))}catch(e){process.stdout.write("")}})' "$1"; }
# curl with light retry so a single dropped response doesn't derail the poll.
cget() { curl -s --retry 2 --retry-all-errors "$@"; }
st() { cget "$TF/api/v1/sessions/$1/turns" | j 'const t=JSON.parse(s).data,l=t[t.length-1],r=(l.state.required_actions||[]);`${l.state.status}|${r[0]?r[0].type:"-"}|${l.id}`'; }

echo "▶ resetting the cluster to the failing state (if kind is present)..."
kubectl --context "$CTX" -n prod set resources deploy/checkout --limits=memory=256Mi >/dev/null 2>&1 || echo "  (no kind cluster; server is likely in sim mode — fine)"

echo "▶ opening a session and firing the incident..."
SID=$(curl -s -X POST "$TF/api/v1/sessions" -H "Content-Type: application/json" -d '{"agent":{"name":"deadman"}}' | j 'JSON.parse(s).data.id')
[ -z "$SID" ] && { echo "  ✖ could not create session (is TrueForge up + agent 'deadman' registered?)"; exit 1; }
echo "  session: $SID"
curl -s -X POST "$TF/api/v1/sessions/$SID/turns" -H "Content-Type: application/json" \
  -d '{"input":[{"type":"user.message","content":"PROD INCIDENT: checkout is OOMKilled in prod. Investigate and remediate."}],"stream":false}' -o /dev/null

echo "▶ agent working (investigate -> propose -> dry-run -> execute)..."
for i in $(seq 1 25); do R=$(st "$SID"); case "$R" in *approval_required*) echo "  ⏸ APPROVAL GATE hit"; break;; *done|*error*) break;; esac; sleep 3; done
TID=$(echo "$R" | cut -d'|' -f3)

if echo "$R" | grep -q approval_required; then
  TCID=$(cget "$TF/api/v1/sessions/$SID/turns/$TID/events" | j 'const e=JSON.parse(s).data||[];(e.find(x=>(x.type||"").includes("approval"))||{tool_calls:[{}]}).tool_calls[0].id||""')
  echo "  ✅ [auto-approving the gated action; a human clicks Allow/Deny in the UI]"
  curl -s -X POST "$TF/api/v1/sessions/$SID/turns" -H "Content-Type: application/json" \
    -d "{\"input\":[{\"type\":\"user.tool_approval\",\"thread_id\":\"main\",\"tool_call_id\":\"$TCID\",\"approval\":{\"status\":\"allow\"}}],\"previous_turn_id\":\"$TID\",\"stream\":false}" -o /dev/null
  for i in $(seq 1 30); do R=$(st "$SID"); case "$R" in *done|*error*) break;; esac; sleep 3; done
fi

echo ""
echo "▶ RESULT (independent kubectl check, if kind):"
LIM=$(kubectl --context "$CTX" -n prod get deploy checkout -o jsonpath='{.spec.template.spec.containers[0].resources.limits.memory}' 2>/dev/null || echo "n/a")
RR=$(kubectl --context "$CTX" -n prod get deploy checkout -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "n/a")
echo "  checkout memory limit: $LIM   readyReplicas: $RR"

echo "▶ PERSISTED SESSION (resume): full trajectory is retrievable after the fact —"
cget "$TF/api/v1/sessions/$SID/turns" | j 'const t=JSON.parse(s).data;`  ${t.length} turn(s) durably stored for session '"$SID"'`'
echo ""
echo "✅ demo complete."
