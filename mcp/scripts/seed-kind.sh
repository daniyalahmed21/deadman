#!/usr/bin/env bash
# Provision (or reseed) the local kind cluster with the failing scenario, then run the
# MCP server in kind mode.
#
#   bash scripts/seed-kind.sh          # create cluster + seed + (optionally) start server
#   bash scripts/seed-kind.sh --reset  # just reseed the failing state on an existing cluster
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER="${KIND_CLUSTER:-deadman}"
CTX="kind-${CLUSTER}"

if [ "${1:-}" != "--reset" ]; then
  if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
    echo "creating kind cluster '$CLUSTER' (first run pulls the node image, ~1GB)..."
    kind create cluster --name "$CLUSTER" --wait 90s
  fi
fi

echo "applying the failing scenario..."
kubectl --context "$CTX" apply -f k8s/seed.yaml
# Force the broken limit even if the deployment already existed at 512Mi.
kubectl --context "$CTX" -n prod set resources deploy/checkout --limits=memory=256Mi >/dev/null 2>&1 || true

echo "done. checkout will OOMKill at 256Mi. Start the engine against the real cluster with:"
echo "  DEADMAN_CLUSTER=kind npm start"
