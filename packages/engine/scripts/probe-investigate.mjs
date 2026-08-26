// Print the current investigate_incident verdict from the running server.
// Used to show the investigation is LIVE: change the cluster, run again, verdict changes.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const c = new Client({ name: "probe", version: "0.0.1" }, { capabilities: {} });
await c.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${process.env.PORT ?? 9000}/mcp`)));
const r = await c.callTool({ name: "investigate_incident", arguments: { alert: "checkout" } });
const inv = JSON.parse(r.content[0].text);
console.log(`is_noise=${inv.is_noise} validity=${inv.validity_score} :: ${inv.root_cause}`);
await c.close();
