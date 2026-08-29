# @deadman/console

DEADMAN's operator console: it hosts **TrueForge's own chat UI** (via `@truefoundry/trueforge-ui`)
and overrides a single slot — the tool-approval bar — with a custom **diff + rollback + blast-radius
card** (`DeadmanApprovalCard`). The Allow/Deny decision still flows through TrueForge's built-in bar
underneath the card, so the safety mechanism is re-skinned, never reimplemented.

This is the generative-UI stretch (TrueForge's marquee "custom approval card" feature). The
**built-in Allow/Deny bar remains the guaranteed demo baseline** — the console is additive.

## Status (honest)

- **Code-complete and type-correct.** `pnpm --filter @deadman/console typecheck` passes against the
  real shipped SDK types. The card reads the pending call's args via `useTrueFoundryApprovals()`
  and wires Allow/Deny through the built-in `ToolApprovalBar`.
- **Stack runs locally.** TrueForge (Docker, :8790) + engine (:9000) + this console (dev, :5174)
  come up together, and the console reaches TrueForge through the `/api` proxy.
- **Known blocker — Vite dep pre-bundling.** `vite dev` and `vite build` fail to render the SDK
  with `Export 'import_react3' is not defined in module` — a Vite/esbuild interop bug with the
  assistant-ui-based SDK tree (React dedupe, `optimizeDeps.include`, and `jsx: automatic` did not
  resolve it). The SDK is designed for a **Next.js/webpack host**; that is the recommended fix —
  re-home this `App`/card in a minimal Next.js app and it should render as-is.
- **Full demo also needs a model provider.** TrueForge rejects the `deadman` agent until an
  Anthropic key is configured in its UI (a manual, user-only step).

## Run (local, with TrueForge in Docker)

```sh
# 1) TrueForge (harness) in Docker
docker run --rm --name tf-p1 -p 8790:8790 -e HOST=0.0.0.0 -e PORT=8790 \
  --add-host host.docker.internal:host-gateway node:22 npx --yes @truefoundry/trueforge

# 2) the engine (MCP server) - seed the kind scenario first: pnpm --filter deadman-mcp run seed:kind
pnpm --filter deadman-mcp start   # :9000

# 3) this console
pnpm --filter @deadman/console dev                    # :5174 (proxies /api -> :8790)
```

Then, in TrueForge (http://localhost:8790): add an Anthropic model provider (your key), and the
`deadman` agent + MCP server register automatically from the engine. Drive a gated action from the
console chat to see the custom approval card.
