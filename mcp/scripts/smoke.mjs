// Smoke test: connect to the running MCP server, list tools, and exercise a few.
// Usage: node scripts/smoke.mjs   (server must be running on PORT, default 9000)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = `http://localhost:${process.env.PORT ?? 9000}/mcp`;
const line = (s = "") => console.log(s);

const client = new Client({ name: "smoke", version: "0.0.1" }, { capabilities: {} });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
line(`connected → ${URL_}\n`);

// 1) List tools and show which ones the harness would gate.
const { tools } = await client.listTools();
line(`TOOLS (${tools.length}):`);
for (const t of tools) {
  const a = t.annotations ?? {};
  const gated = a.destructiveHint === true;
  const cls = gated ? "WRITE·GATED" : a.readOnlyHint === true ? "READ" : "WRITE·safe";
  line(`  ${gated ? "🔒" : "  "} ${t.name.padEnd(22)} ${cls}`);
}

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content?.[0]?.text ?? "", isError: r.isError === true };
};
const assert = (cond, msg) => { if (!cond) { console.error(`❌ ${msg}`); process.exit(1); } };

// 2) Investigate → should return a root-cause report.
line(`\ninvestigate_incident:`);
const inv = JSON.parse((await call("investigate_incident", { alert: "checkout OOMKilled" })).text);
line(`  root_cause: ${inv.root_cause}`);
line(`  validity_score: ${inv.validity_score}  is_noise: ${inv.is_noise}`);

// 3) The real fix (bump memory) → verify the loop closes.
line(`\nbump_memory(checkout, 512):`);
line(`  ${(await call("bump_memory", { target: "checkout", mib: 512 })).text}`);
const v = JSON.parse((await call("verify_resolution", { target: "checkout" })).text);
line(`verify_resolution → healthy: ${v.healthy}  resolved: ${v.resolved}`);
assert(v.resolved === true, "expected incident resolved after bump_memory");

// 4) Sensitive-target floor: a destructive op on a protected target must be REFUSED.
line(`\ndelete_pvc(orders-db-pvc) [protected]:`);
const refused = await call("delete_pvc", { target: "orders-db-pvc" });
line(`  ${refused.text}`);
assert(refused.isError === true, "expected delete_pvc on a protected target to be refused");

// 5) Audit trail: every mutating call (executed or refused) is recorded.
const auditLog = JSON.parse((await call("get_audit_log")).text);
line(`\naudit trail (${auditLog.entries.length} entries):`);
for (const e of auditLog.entries) line(`  #${e.seq} ${e.action} ${e.target} [${e.tier}] ${e.isError ? "REFUSED" : "OK"}`);
assert(auditLog.entries.some((e) => e.action === "bump_memory" && !e.isError), "audit missing bump_memory OK");
assert(auditLog.entries.some((e) => e.action === "delete_pvc" && e.isError), "audit missing refused delete_pvc");

await client.close();
line(`\n✅ smoke test passed`);
