// End-to-end integration test: drives the full incident arc over MCP against whatever
// backend the server is running (sim or kind), plus every safety refusal. Exits non-zero
// on any failed assertion. Run with the server up on PORT (default 9000).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const line = (s = "") => console.log(s);
const fails = [];
const ok = (cond, msg) => { line(`  ${cond ? "✅" : "❌"} ${msg}`); if (!cond) fails.push(msg); };

const c = new Client({ name: "e2e", version: "0.0.1" }, { capabilities: {} });
await c.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${process.env.PORT ?? 9000}/mcp`)));
const call = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  return { json: safeJson(r.content?.[0]?.text), text: r.content?.[0]?.text ?? "", isError: r.isError === true };
};
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

line("PHASE 1 — TRIAGE");
const tri = (await call("triage", { alert: "checkout OOMKilled in prod, pods restarting" })).json;
ok(tri?.severity === "critical" && tri?.is_noise === false, "triage: critical, not noise");
ok((await call("triage", { alert: "INFO: alert resolved" })).json?.is_noise === true, "triage: resolved alert is noise");

line("\nPHASE 2 — INVESTIGATE (grounded)");
const inv = (await call("investigate_incident", { alert: "checkout OOMKilled" })).json;
ok(inv?.is_noise === false && inv?.validity_score >= 0.8, "investigate: real incident, high validity");
ok(/OOMKill/i.test(inv?.root_cause ?? "") || /working set/i.test(inv?.root_cause ?? ""), "investigate: OOM/working-set root cause");
const met = (await call("get_metrics", {})).json;
ok(met && typeof met.workingSetMib === "number", "get_metrics: returns working set");
ok(Array.isArray((await call("get_events", {})).json?.events), "get_events: array");
ok(Array.isArray((await call("get_logs", {})).json?.logs), "get_logs: array");
ok(Array.isArray((await call("get_deploy_history", {})).json?.history), "get_deploy_history: array");
ok(/bump_memory/i.test(JSON.stringify((await call("get_runbook", { symptom: "OOMKilled" })).json)), "get_runbook: OOM rule");

line("\nPHASE 3 — REMEDIATE (safe + gated + refusals)");
const prop = (await call("propose_remediation", { root_cause: inv?.root_cause ?? "OOM" })).json;
ok(prop?.actions?.some((a) => a.tier === "HARDLINE" && a.executable === false), "propose: HARDLINE tagged executable:false");
ok(!(await call("dry_run", { tool: "bump_memory", target: "checkout" })).isError, "dry_run: no mutation");
ok(!(await call("restart_pod", { target: "checkout" })).isError, "restart_pod: SAFE runs");
ok(!(await call("bump_memory", { target: "checkout", mib: 512 })).isError, "bump_memory: applies the fix");
// Safety refusals
ok((await call("delete_pvc", { target: "orders-db-pvc" })).isError === true, "sensitive-target floor: delete protected PVC refused");
const drain = await call("drain_node", { node: "deadman-control-plane" });
ok(drain.isError === true && /HARDLINE/i.test(drain.text), "HARDLINE: draining the only node refused");

line("\nPHASE 4 — VERIFY + AUDIT");
const v = (await call("verify_resolution", { target: "checkout" })).json;
ok(v?.resolved === true, "verify_resolution: resolved after bump_memory");
const audit = (await call("get_audit_log", {})).json;
ok(audit?.entries?.some((e) => e.action === "bump_memory" && !e.isError), "audit: bump_memory recorded OK");
ok(audit?.entries?.some((e) => e.action === "drain_node" && e.isError), "audit: refused drain recorded");

await c.close();
line(`\n${fails.length === 0 ? "✅ E2E PASSED" : `❌ E2E FAILED (${fails.length})`}`);
process.exit(fails.length === 0 ? 0 : 1);
