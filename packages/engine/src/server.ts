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
import { demoMode } from "./config.js";
import { allIncidents } from "./incidents.js";
import { costReport } from "./cost.js";
import { policy } from "./classifier.js";
import { seedDemoIncidents } from "./seed.js";

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
app.get("/dashboard/seed-demo", (_req, res) => {
  cors(res);
  // Seeding wipes and replays the demo stores; refuse outside demo mode so a live audit
  // trail can never be erased by hitting this endpoint.
  if (!demoMode()) {
    res.status(403).json({ seeded: 0, skipped: "seeding is disabled outside demo mode" });
    return;
  }
  res.json(seedDemoIncidents());
});

app.get("/healthz", (_req, res) =>
  res.json({ ok: true, backend: backend.mode, demo: demoMode(), narration: narrationEnabled(), ts: Date.now() }),
);

app.get("/", (_req, res) => res.type("text").send("deadman MCP - POST /mcp · dashboard at /dashboard"));

// In demo mode, pre-populate the history/safety/cost views with real scenario runs so the
// platform is fully rendered the instant it boots (deterministic; sim only).
if (demoMode()) {
  const { seeded } = seedDemoIncidents();
  console.log(`[deadman] demo seed: ${seeded} incident(s) replayed through the real pipeline`);
}

app.listen(PORT, () => {
  console.log(`[deadman] MCP server on http://localhost:${PORT}/mcp`);
  console.log(
    "[deadman] tools: investigate_incident, get_service_health, propose_remediation, dry_run,",
  );
  console.log(
    "[deadman]        verify_resolution, restart_pod (SAFE), bump_memory/rollback_deploy/",
  );
  console.log("[deadman]        delete_pvc/scale_to_zero (GATED, destructiveHint)");
  console.log(`[deadman] investigation narration: ${narrationEnabled() ? "LLM (key present)" : "deterministic"}`);
  console.log(`[deadman] backend: ${backend.mode}${demoMode() ? " · DEMO MODE (deterministic, sim, OOM scenario)" : ""} · dashboard: /dashboard · health: /healthz`);
});
