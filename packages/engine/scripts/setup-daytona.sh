#!/usr/bin/env bash
# Configure TrueForge's Daytona sandbox provider and register the sre-runbook skill.
# Reads DAYTONA_API_KEY from the environment (e.g. `set -a; . mcp/.env; set +a`); never
# hard-codes the secret. The Daytona snapshot build can 502 transiently — this retries.
set -uo pipefail
TF="${TRUEFORGE_URL:-http://localhost:8790}"
: "${DAYTONA_API_KEY:?set DAYTONA_API_KEY (e.g. source mcp/.env)}"

echo "▶ configuring Daytona sandbox provider (retries transient build 502s)..."
for i in 1 2 3 4 5; do
  code=$(curl -s -o /tmp/tf-sb.json -w "%{http_code}" -X PUT "$TF/api/v1/settings/sandbox-providers" \
    -H "Content-Type: application/json" \
    -d "{\"manifest\":{\"type\":\"daytona\",\"auth\":{\"api_key\":\"$DAYTONA_API_KEY\"},\"exec_timeout_ms\":60000,\"auto_stop_interval_in_minutes\":5,\"auto_archive_interval_in_minutes\":60,\"auto_delete_interval_in_minutes\":7200}}")
  echo "  attempt $i -> HTTP $code"
  [ "$code" = "200" ] && break
  sleep 4
done

echo "▶ waiting for the sandbox image build..."
for i in $(seq 1 30); do
  st=$(curl -s "$TF/api/v1/settings/sandbox-providers" | grep -oE '"status":"[a-z]+"' | head -1)
  echo "  $st"; echo "$st" | grep -qi ready && break; sleep 6
done

echo "▶ registering the sre-runbook git skill..."
curl -s -X POST "$TF/api/v1/settings/skills" -H "Content-Type: application/json" \
  -d '{"manifest":{"type":"git","name":"sre-runbook","url":"https://github.com/daniyalahmed21/deadman","ref":"main","path":"skills/sre-runbook","description":"SRE remediation decision rules."}}' \
  -w "\n  HTTP %{http_code}\n" | tail -1

echo "done. Ensure the agent has config.sandbox.enabled=true and skills:[{name:sre-runbook}] (see agent.deadman.json)."
