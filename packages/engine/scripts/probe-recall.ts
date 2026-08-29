import { recallSimilar } from "../src/recall.js";
import { allMemories } from "../src/memory.js";
const alert = { service: "checkout", signal: "OOMKilled", text: "checkout OOMKilled: memory limit below working set" };
console.log("memories loaded:", allMemories().length);
const m = recallSimilar(alert, allMemories());
console.log("recall:", m ? `${m.id} (${m.strength})` : "(none - honest empty on a fresh cluster)");
