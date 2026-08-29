/**
 * Alert-ingestion HTTP surface: `POST /alerts`.
 *
 * The handler's only job is to validate, authenticate, and persist — then return immediately.
 * All the slow, failure-prone work (opening a TrueForge session, driving the agent) happens off
 * the request path in the worker. That separation is what lets the webhook stay fast and lossless
 * under an alert storm.
 *
 * Wire it up once at boot with `installAlertIngestion(app)`; it no-ops unless DEADMAN_ALERTS is on.
 */

import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { alertConfig, alertsEnabled } from "./config.js";
import { parseAlert } from "./schema.js";
import { BullAlertQueue, type AlertQueue } from "./queue.js";
import { startAlertWorker, type AlertWorker } from "./worker.js";
import { emit } from "../events.js";

export interface AlertIngestion {
  queue: AlertQueue;
  worker: AlertWorker;
  close(): Promise<void>;
}

/** Loopback callers (the host itself) are trusted; anything else needs the bearer token. */
function isLoopback(req: Request): boolean {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "localhost";
}

function authorized(req: Request): boolean {
  if (isLoopback(req)) return true;
  if (!alertConfig.ingestToken) return false; // no token configured ⇒ loopback-only
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && presented === alertConfig.ingestToken;
}

/**
 * Mount the ingestion routes. Returns handles for graceful shutdown, or null when ingestion is
 * disabled (the engine then behaves exactly as before — a pure MCP server).
 */
export function installAlertIngestion(app: Express): AlertIngestion | null {
  if (!alertsEnabled()) return null;

  const queue: AlertQueue = new BullAlertQueue();
  const worker = startAlertWorker();

  app.post("/alerts", async (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.status(401).json({ error: "unauthorized — loopback only, or supply a valid bearer token" });
      return;
    }
    let alert;
    try {
      alert = parseAlert(req.body);
    } catch (err) {
      const message = err instanceof ZodError ? err.issues.map((i) => i.message).join("; ") : String(err);
      res.status(400).json({ error: `invalid alert payload: ${message}` });
      return;
    }
    try {
      const result = await queue.enqueue(alert);
      // Surface the intake on the live cockpit stream immediately, before the agent even starts.
      emit({
        kind: "signal",
        phase: "triage",
        severity: result.accepted ? "info" : "warn",
        message: result.accepted
          ? `Alert received: "${alert.alertName}" (${alert.source}, ${alert.severity}) — queued for investigation`
          : `Duplicate alert suppressed: "${alert.alertName}" (${alert.source})`,
      });
      // 202 Accepted: persisted and will be worked, but not yet processed.
      res.status(202).json({
        queued: result.accepted,
        duplicate: !result.accepted,
        dedup_key: result.dedupKey,
        queue_depth: result.depth,
      });
    } catch (err) {
      // Redis down / queue unreachable: fail loud with 503 so the monitor retries, never a silent drop.
      res.status(503).json({ error: `alert queue unavailable: ${String(err)}` });
    }
  });

  // Ingestion health + dead-letter visibility.
  app.get("/alerts/health", async (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, depth: await queue.depth(), dead_letter: await queue.deadLetterCount() });
    } catch (err) {
      res.status(503).json({ ok: false, error: String(err) });
    }
  });

  return {
    queue,
    worker,
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
