#!/usr/bin/env bash
# Fire a test incident alert at the DEADMAN webhook (POST /alerts), exactly as a real monitor
# (Prometheus Alertmanager / Datadog / Grafana) would. This is the hands-off demo trigger:
# the alert lands on the durable queue, a worker opens a TrueForge session, and the agent works it.
#
# The webhook trusts loopback, so we fire from INSIDE the engine container to avoid needing a
# bearer token. Override the container/URL with env vars if your setup differs.
#
# Usage:
#   bash scripts/fire-alert.sh                                  # checkout OOMKilled, critical
#   bash scripts/fire-alert.sh "checkout OOMKilled" critical prometheus "pods restarting in prod"
#   ALERT_CONTAINER=deadman-engine-1 bash scripts/fire-alert.sh
set -euo pipefail

NAME="${1:-checkout OOMKilled}"
SEVERITY="${2:-critical}"
SOURCE="${3:-prometheus}"
SUMMARY="${4:-$NAME in prod, pods restarting}"
CONTAINER="${ALERT_CONTAINER:-deadman-engine-1}"
URL="${ALERT_URL:-http://localhost:9000/alerts}"

echo "firing alert \"$NAME\" ($SEVERITY, $SOURCE) -> $URL  (via container $CONTAINER)"
docker exec \
  -e A_NAME="$NAME" -e A_SEV="$SEVERITY" -e A_SRC="$SOURCE" -e A_SUM="$SUMMARY" -e A_URL="$URL" \
  "$CONTAINER" node -e '
    const body = JSON.stringify({
      alertname: process.env.A_NAME,
      severity: process.env.A_SEV,
      source: process.env.A_SRC,
      summary: process.env.A_SUM,
    });
    fetch(process.env.A_URL, { method: "POST", headers: { "content-type": "application/json" }, body })
      .then(async (r) => { console.log("HTTP", r.status, await r.text()); })
      .catch((e) => { console.error("ERR", e.message); process.exit(1); });
  '
