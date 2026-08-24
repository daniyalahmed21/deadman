# deadman-mcp

DEADMAN's SRE engine, exposed to TrueForge as a **remote HTTP MCP server** (streamable-HTTP).

## Run

```sh
npm install
npm run dev          # http://localhost:9000/mcp   (PORT env overrides)
```

## Register in TrueForge

Settings → Connectors → **Add MCP Server**:
- Name: `deadman`  ·  Description: *required*  ·  Auth: None
- URL: **`http://host.docker.internal:9000/mcp`** (TrueForge runs in Docker; `localhost` there is the container, not your host).

## Tool surface

| Tool | Class | Annotation | Gated? |
|---|---|---|---|
| `investigate_incident(alert)` | READ | `readOnlyHint` | no |
| `get_service_health(service)` | READ | `readOnlyHint` | no |
| `propose_remediation(root_cause)` | READ | `readOnlyHint` | no |
| `dry_run(tool, target)` | READ | `readOnlyHint` | no |
| `verify_resolution(target)` | READ | `readOnlyHint` | no |
| `restart_pod(target)` | WRITE (reversible) | — | no (SAFE, auto) |
| `bump_memory(target, mib)` | WRITE | `destructiveHint` | **yes** |
| `rollback_deploy(target)` | WRITE | `destructiveHint` | **yes** |
| `delete_pvc(target)` | WRITE | `destructiveHint` | **yes** |
| `scale_to_zero(target)` | WRITE | `destructiveHint` | **yes** |

HARDLINE actions (delete primary DB, delete namespace, …) are **not** registered as tools;
`propose_remediation` returns them tagged `executable:false`.

## Status

- ✅ Transport, full tool surface, gate annotations, deterministic in-memory cluster sim.
- ⏳ `investigate_incident` returns a **canned** result — swap for the live investigation
  call once the engine's API key is wired.
- ⏳ Remediation tools mutate the **sim**; point them at a real cluster later.

The output contracts won't change when the stubs are swapped — only the tool bodies.
