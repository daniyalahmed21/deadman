/**
 * DEADMAN tool surface (composition root).
 *
 * Every tool is tagged Class = READ or WRITE. The MCP annotation is the machine-readable form of
 * that tag and is what TrueForge's approval gate reads:
 *   READ  → readOnlyHint: true          → runs free
 *   WRITE (reversible/low-risk) → no destructiveHint → SAFE, auto-runs, but stays a visible call
 *   WRITE (destructive)         → destructiveHint: true → GATED (Allow/Deny pause)
 *
 * HARDLINE actions are deliberately NOT registered as callable tools; propose_remediation surfaces
 * them tagged { executable: false } so the model can see the limit but never invoke it.
 *
 * The registrations live in tools/read.ts and tools/write.ts; the logic behind the heavier
 * handlers lives in flows.ts so it stays unit-testable.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

export function registerDeadmanTools(server: McpServer): void {
  registerReadTools(server);
  registerWriteTools(server);
}
