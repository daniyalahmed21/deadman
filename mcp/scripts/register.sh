#!/usr/bin/env bash
# Register the deadman MCP server with a locally running TrueForge.
# TrueForge runs in Docker, so it reaches this host via host.docker.internal.
#
# Prereqs: TrueForge up on :8790, this MCP server up on :9000.
# Usage:   bash scripts/register.sh
set -euo pipefail

TF="${TRUEFORGE_URL:-http://localhost:8790}"
MCP_URL="${MCP_URL:-http://host.docker.internal:9000/mcp}"

echo "registering deadman -> $MCP_URL  (TrueForge at $TF)"
curl -s -X POST "$TF/api/v1/settings/mcp-servers" \
  -H "Content-Type: application/json" \
  -d "{\"manifest\":{\"type\":\"remote\",\"name\":\"deadman\",\"url\":\"$MCP_URL\",\"description\":\"DEADMAN SRE engine: investigate incidents and remediate behind an approval gate.\"}}" \
  -w "\n  HTTP %{http_code}\n"

echo "verifying discovery..."
curl -s "$TF/api/v1/mcp-servers/deadman/tools" | grep -oE '"name":"[^"]*"' | sed 's/^/  /'
