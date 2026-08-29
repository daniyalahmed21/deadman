import { backend } from "../src/backend.js";
import { correlateChange } from "../src/correlate.js";
const svc = process.argv[2] ?? "checkout";
const changes = backend.changeHistory(svc);
console.log("changeHistory:", JSON.stringify(changes));
const corr = correlateChange(changes, Date.now(), "oom", backend.serviceHealth(svc).memLimitMib);
console.log("suspect:", corr.suspected ? corr.suspected.summary : "(none)", "| confidence:", corr.confidence, "| minutesBefore:", corr.minutesBefore);
