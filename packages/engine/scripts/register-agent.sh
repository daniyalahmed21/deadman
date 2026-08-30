#!/usr/bin/env bash
# Register the DEADMAN agent with a locally running TrueForge from agent.deadman.json.
#
# Run this AFTER you have connected the Anthropic provider (its API key) in the TrueForge UI
# (Settings -> Models -> anthropic). The agent's model is anthropic/claude-sonnet-4-6, so this
# POST returns 422 "provider not configured" until that key is in place.
#
# Prereqs: TrueForge up on :8790; the deadman MCP connector already registered (scripts/register.sh).
# Usage:   bash scripts/register-agent.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TF="${TRUEFORGE_URL:-http://localhost:8790}"
SPEC="agent.deadman.json"

echo "registering agent 'deadman' from $SPEC  (TrueForge at $TF)"
BODY=$(node -e "const s=require('./$SPEC'); process.stdout.write(JSON.stringify({name:'deadman',manifest:{name:'deadman',...s}}))")
curl -s -X POST "$TF/api/v1/agents" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  -w "\n  HTTP %{http_code}\n"

echo "verifying..."
curl -s "$TF/api/v1/agents" | grep -oE '"name":"[^"]*"' | sed 's/^/  /' || true
