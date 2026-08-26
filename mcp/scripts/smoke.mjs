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

// 2) Investigate → grounded root-cause report from live signals.
line(`\ninvestigate_incident:`);
const inv = JSON.parse((await call("investigate_incident", { alert: "checkout OOMKilled" })).text);
line(`  root_cause: ${inv.root_cause}`);
line(`  validity_score: ${inv.validity_score}  is_noise: ${inv.is_noise}`);
// Deterministic fields hold whether or not LLM narration reworded the prose.
assert(inv.is_noise === false, "expected a real incident (is_noise=false) in the failing state");
assert(inv.validity_score >= 0.8, "expected high validity in the failing state");

// 2a1) Triage — cheap first pass.
const tri = JSON.parse((await call("triage", { alert: "checkout OOMKilled, pods restarting" })).text);
line(`triage → severity=${tri.severity} is_noise=${tri.is_noise} investigate=${tri.recommend_investigate}`);
assert(tri.is_noise === false && tri.severity === "critical", "expected critical triage for an OOMKill alert");

// 2a2) Live telemetry tools.
const met = JSON.parse((await call("get_metrics", { service: "checkout" })).text);
line(`get_metrics → working set ${met.workingSetMib}Mi, cpu ${met.cpuMillis}m`);
assert(met.workingSetMib > 0, "expected non-zero working set from get_metrics");
const evs = JSON.parse((await call("get_events", { service: "checkout" })).text);
line(`get_events → ${evs.events.length} event(s)`);
assert(Array.isArray(evs.events), "expected events array");

// 2b) Runbook guidance for the symptom.
const rb = JSON.parse((await call("get_runbook", { symptom: "OOMKilled" })).text);
line(`get_runbook(OOMKilled): ${rb.runbook[0]?.rule?.slice(0, 70)}...`);
assert(rb.runbook.length > 0 && /bump_memory/i.test(rb.runbook[0].rule), "expected OOMKilled runbook rule");

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

// 4b) New gated actions: scale works; draining the only node is refused (HARDLINE).
line(`\nscale_deployment(checkout, 2): ${(await call("scale_deployment", { target: "checkout", replicas: 2 })).text}`);
const drain = await call("drain_node", { node: "deadman-control-plane" });
line(`drain_node(only node): ${drain.text}`);
assert(drain.isError === true && /HARDLINE/i.test(drain.text), "expected drain of the only node to be refused (HARDLINE)");

// 5) Audit trail: every mutating call (executed or refused) is recorded.
const auditLog = JSON.parse((await call("get_audit_log")).text);
line(`\naudit trail (${auditLog.entries.length} entries):`);
for (const e of auditLog.entries) line(`  #${e.seq} ${e.action} ${e.target} [${e.tier}] ${e.isError ? "REFUSED" : "OK"}`);
assert(auditLog.entries.some((e) => e.action === "bump_memory" && !e.isError), "audit missing bump_memory OK");
assert(auditLog.entries.some((e) => e.action === "delete_pvc" && e.isError), "audit missing refused delete_pvc");

// 6) Postmortem generation from the audit trail + investigation.
const pm = (await call("generate_postmortem", {})).text;
line(`\ngenerate_postmortem → ${pm.split("\n")[0]} (${pm.length} chars)`);
assert(/# Incident Postmortem/.test(pm) && /Actions taken/.test(pm), "expected a postmortem with actions");

// 7) Live dashboard endpoint (same-origin cockpit state).
const ds = await fetch(`http://localhost:${process.env.PORT ?? 9000}/dashboard/state`).then((r) => r.json());
line(`dashboard/state → mode=${ds.mode} resolved=${ds.resolved} audit=${ds.audit.length}`);
assert(typeof ds.mode === "string" && Array.isArray(ds.audit), "expected dashboard state with mode + audit");
const html = await fetch(`http://localhost:${process.env.PORT ?? 9000}/dashboard`).then((r) => r.text());
assert(/Incident Cockpit/.test(html), "expected the dashboard HTML to serve");

await client.close();
line(`\n✅ smoke test passed`);
