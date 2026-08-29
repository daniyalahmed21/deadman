#!/usr/bin/env bash
# Provision (or reseed) the local kind cluster with the failing scenario, then run the
# MCP server in kind mode.
#
#   bash scripts/seed-kind.sh          # create cluster + seed + (optionally) start server
#   bash scripts/seed-kind.sh --reset  # just reseed the failing state on an existing cluster
#
# The seed builds a REAL, correlatable change history: a healthy 512Mi revision, a time gap,
# then the culprit cut to 256Mi with a recorded change-cause. Change-correlation reads this
# from the actual ReplicaSets, so the "suspected change" is genuine, not fabricated.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER="${KIND_CLUSTER:-deadman}"
CTX="kind-${CLUSTER}"
NS=prod
D=checkout

if [ "${1:-}" != "--reset" ]; then
  if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
    echo "creating kind cluster '$CLUSTER' (first run pulls the node image, ~1GB)..."
    kind create cluster --name "$CLUSTER" --wait 90s
  fi
fi

echo "clean slate (so the culprit revision is genuinely new)..."
# A reused old ReplicaSet keeps its stale creationTimestamp, which would make correlation
# think the change is days old. Deleting first guarantees fresh, recent revisions.
kubectl --context "$CTX" -n "$NS" delete deploy "$D" --ignore-not-found --wait=true >/dev/null 2>&1 || true
kubectl --context "$CTX" -n "$NS" delete rs -l app="$D" --ignore-not-found --wait=true >/dev/null 2>&1 || true

echo "seeding the workload, healthy at 512Mi..."
kubectl --context "$CTX" apply -f k8s/seed.yaml
kubectl --context "$CTX" -n "$NS" annotate deploy/"$D" --overwrite \
  kubernetes.io/change-cause="initial rollout, memory=512Mi" >/dev/null
kubectl --context "$CTX" -n "$NS" set resources deploy/"$D" --limits=memory=512Mi >/dev/null
kubectl --context "$CTX" -n "$NS" rollout status deploy/"$D" --timeout=120s

GAP="${DEADMAN_CHANGE_GAP_SECONDS:-240}"
echo "waiting ${GAP}s so the culprit change has a real timestamp gap (set DEADMAN_CHANGE_GAP_SECONDS to change)..."
sleep "$GAP"

echo "the culprit: cut memory to 256Mi with a recorded reason..."
kubectl --context "$CTX" -n "$NS" annotate deploy/"$D" --overwrite \
  kubernetes.io/change-cause="cost-saving: reduced memory allocation" >/dev/null
kubectl --context "$CTX" -n "$NS" set resources deploy/"$D" --limits=memory=256Mi >/dev/null

echo "done. checkout now OOMKills at 256Mi, and rollout history shows the real 512Mi->256Mi cut."
echo "start the engine against the real cluster with:"
echo "  DEADMAN_CLUSTER=kind npm start"
