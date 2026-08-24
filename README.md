# DEADMAN

An AI SRE with a **license to act** on production.

Every incident bot *diagnoses* — read-only, safe, boring. DEADMAN **remediates**: it
investigates an incident, proposes fixes, and then acts. The safety model is graduated
autonomy:

- **Reversible, low-blast-radius** actions (e.g. rollout-restart) auto-execute.
- **Irreversible / destructive** actions hard-stop at a **human-approval checkpoint** with a
  diff + rollback card before anything is touched.
- **Catastrophic** actions (delete the primary database, drop a namespace) are **refused
  outright** — a license to act has limits.

Dry-run first, closed-loop verify after, full audit trail.

Built to run on [TrueForge](https://github.com/truefoundry/trueforge) — the harness owns the
visible safety (the approval pause on destructive tools), which is the whole point.

## Layout

- **`mcp/`** — the DEADMAN engine, exposed to TrueForge as a remote HTTP MCP server
  (streamable-HTTP). Full tool surface with read/write gate annotations, a blast-radius
  classifier, and a deterministic in-memory cluster for closed-loop demos. See
  [`mcp/README.md`](mcp/README.md).

## Quick start

```sh
cd mcp
npm install
npm run dev        # http://localhost:9000/mcp
```

Then register `http://host.docker.internal:9000/mcp` in TrueForge → Settings → Connectors.

## Status

Developer build. Tracking progress in [`TODO.md`](TODO.md).

## License

MIT
