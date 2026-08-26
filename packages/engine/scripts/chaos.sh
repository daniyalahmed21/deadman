#!/usr/bin/env bash
# Chaos seeder — inject a failure scenario into the kind cluster on demand.
#   bash scripts/chaos.sh oom | crashloop | imagepull
# For the sim backend, set DEADMAN_SCENARIO=<scenario> when starting the server instead.
set -uo pipefail
cd "$(dirname "$0")/.."
CTX="${KIND_CONTEXT:-kind-deadman}"
SCENARIO="${1:-oom}"

case "$SCENARIO" in
  oom)
    kubectl --context "$CTX" apply -f k8s/seed.yaml
    kubectl --context "$CTX" -n prod set resources deploy/checkout --limits=memory=256Mi >/dev/null 2>&1 || true
    echo "seeded: OOMKill (checkout @256Mi vs ~350Mi demand). Fix = bump_memory."
    ;;
  crashloop)
    kubectl --context "$CTX" apply -f k8s/scenarios/crashloop.yaml
    echo "seeded: CrashLoopBackOff (container exits non-zero). Fix = rollback_deploy."
    ;;
  imagepull)
    kubectl --context "$CTX" apply -f k8s/scenarios/imagepull.yaml
    echo "seeded: ImagePullBackOff (bad image ref). Fix = rollback_deploy."
    ;;
  *)
    echo "usage: bash scripts/chaos.sh oom|crashloop|imagepull"; exit 1 ;;
esac
