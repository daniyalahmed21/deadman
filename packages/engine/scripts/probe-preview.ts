/** Dev probe: run previewRemediation against the active backend and print the result.
 *  Real cluster:  KUBECONFIG=~/.kube/config DEADMAN_CLUSTER=kind npx tsx scripts/probe-preview.ts
 */
import { previewRemediation } from "../src/preview.js";
import { backend } from "../src/backend.js";

const action = process.argv[2] ?? "bump_memory";
const target = process.argv[3] ?? "checkout";
const mib = Number(process.argv[4] ?? 512);

console.log(`backend: ${backend.mode}`);
const r = previewRemediation(action, target, { mib });
console.log(JSON.stringify(r, null, 2));
