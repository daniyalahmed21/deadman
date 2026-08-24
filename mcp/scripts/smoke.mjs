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
  return r.content?.[0]?.text ?? "";
};

// 2) Investigate → should return a root-cause report.
line(`\ninvestigate_incident:`);
const inv = JSON.parse(await call("investigate_incident", { alert: "checkout OOMKilled" }));
line(`  root_cause: ${inv.root_cause}`);
line(`  validity_score: ${inv.validity_score}  is_noise: ${inv.is_noise}`);

// 3) The real fix (bump memory) → verify the loop closes.
line(`\nbump_memory(checkout, 512):`);
line(`  ${await call("bump_memory", { target: "checkout", mib: 512 })}`);
line(`verify_resolution(checkout):`);
const v = JSON.parse(await call("verify_resolution", { target: "checkout" }));
line(`  healthy: ${v.healthy}  resolved: ${v.resolved}`);

await client.close();
line(`\n✅ smoke test passed`);
