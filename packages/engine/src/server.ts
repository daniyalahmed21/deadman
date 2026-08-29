/**
 * DEADMAN MCP server - remote streamable-HTTP.
 *
 * Stateful streamable-HTTP with per-session transports is what TrueForge's MCP client
 * expects. Register in TrueForge as  http://host.docker.internal:9000/mcp  (TrueForge runs
 * in Docker, so `localhost` there is the container, not your host).
 *
 * Run:  npm install && npm run dev   →  http://localhost:9000/mcp
 */

import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import { registerDeadmanTools } from "./tools.js";
import { narrationEnabled } from "./llm.js";
import { dashboardState } from "./dashboard.js";
import { backend } from "./backend.js";
import { allIncidents } from "./incidents.js";
import { costReport } from "./cost.js";
import { policy } from "./classifier.js";
import { recent, subscribe } from "./events.js";
import { installAlertIngestion } from "./alerts/webhook.js";
import { alertsEnabled } from "./alerts/config.js";
import { attachAuditStore } from "./audit.js";
import { RedisAuditStore } from "./alerts/persist.js";
import { renderMetrics } from "./metrics.js";

// Load mcp/.env (ANTHROPIC_API_KEY etc.) if present - optional, safe when absent.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  /* no .env - deterministic mode */
}

const PORT = Number(process.env.PORT ?? 9000);

function buildServer(): McpServer {
  const server = new McpServer({ name: "deadman", version: "0.1.0" });
  registerDeadmanTools(server);
  return server;
}

const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  let transport = sid ? transports[sid] : undefined;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport!;
        console.log(`[deadman] session initialized: ${id}`);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) delete transports[transport!.sessionId];
    };
    await buildServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});

const bySession = async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const transport = sid ? transports[sid] : undefined;
  if (!transport) {
    res.status(400).send("Unknown or missing Mcp-Session-Id");
    return;
  }
  await transport.handleRequest(req, res);
};

app.get("/mcp", bySession); // server→client SSE
app.delete("/mcp", bySession); // end session

// --- Live incident cockpit (same-origin with the engine, so no CORS/proxy) --------------
const DASHBOARD_HTML = readFileSync(fileURLToPath(new URL("../public/dashboard.html", import.meta.url)), "utf8");
app.get("/dashboard", (_req, res) => res.type("html").send(DASHBOARD_HTML));
const cors = (res: Response) => res.set("Access-Control-Allow-Origin", "*");
app.get("/dashboard/state", (_req, res) => {
  cors(res);
  res.json(dashboardState());
});
app.get("/dashboard/incidents", (_req, res) => {
  cors(res);
  res.json({ incidents: allIncidents() });
});
app.get("/dashboard/cost", (_req, res) => {
  cors(res);
  res.json(costReport());
});
app.get("/dashboard/policy", (_req, res) => {
  cors(res);
  res.json(policy());
});

// Live agent-event stream (SSE). Replays recent history, then streams new events.
app.get("/dashboard/stream", (req, res) => {
  cors(res);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering so events flush immediately
  });
  res.flushHeaders?.();
  const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  recent().forEach(send);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  const unsubscribe = subscribe(send);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, backend: backend.mode, narration: narrationEnabled(), ts: Date.now() }),
);

app.get("/", (_req, res) => res.type("text").send("deadman MCP - POST /mcp · dashboard at /dashboard"));

// Production alert ingestion (opt-in via DEADMAN_ALERTS): POST /alerts durably queues an inbound
// monitor alert (BullMQ/Redis) and a worker turns each one into a TrueForge session so the
// approval gate still governs remediation. No-ops when disabled — the engine stays a pure MCP server.
const ingestion = installAlertIngestion(app);

// When ingestion (and therefore Redis) is on, make the audit trail durable: replay it on boot and
// mirror every new record to Redis, so a restart does not lose the record of what the agent did.
let auditStore: RedisAuditStore | null = null;
if (ingestion) {
  auditStore = new RedisAuditStore();
  await attachAuditStore(auditStore);
}

const shutdown = async () => {
  if (ingestion) await ingestion.close().catch(() => {});
  if (auditStore) await auditStore.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Prometheus metrics (safety outcomes, incident throughput, queue depth / dead-letter).
app.get("/metrics", async (_req, res) => {
  res.type("text/plain; version=0.0.4").send(await renderMetrics(ingestion?.queue ?? null));
});

// Readiness: dependencies are reachable (the cluster backend, and Redis when ingestion is on).
// Distinct from /healthz (liveness = the process is up).
app.get("/readyz", async (_req, res) => {
  const checks: Record<string, boolean> = { backend: true };
  if (backend.mode === "kind") {
    try {
      checks.backend = backend.nodeCount() > 0;
    } catch {
      checks.backend = false;
    }
  }
  if (ingestion) {
    try {
      await ingestion.queue.depth();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
  }
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ ready, checks });
});

app.listen(PORT, () => {
  console.log(`[deadman] MCP server on http://localhost:${PORT}/mcp`);
  console.log("[deadman] tools: investigate_incident, get_service_health, propose_remediation, dry_run,");
  console.log("[deadman]        verify_resolution, restart_pod (SAFE), bump_memory/rollback_deploy/");
  console.log("[deadman]        delete_pvc/scale_to_zero (GATED, destructiveHint)");
  console.log(`[deadman] investigation narration: ${narrationEnabled() ? "LLM (key present)" : "deterministic"}`);
  console.log(`[deadman] backend: ${backend.mode} (real cluster) · dashboard: /dashboard · health: /healthz`);
  console.log(
    `[deadman] alert ingestion: ${alertsEnabled() ? "ON · POST /alerts (BullMQ/Redis → TrueForge session)" : "off (set DEADMAN_ALERTS=1 + Redis to enable)"}`,
  );
});
