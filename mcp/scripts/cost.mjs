// Per-session cost telemetry: reads a TrueForge session's real turn token usage and computes
// the dollar cost + prompt-cache savings with Anthropic pricing.
//   node scripts/cost.mjs <session_id> [model]
// Model defaults to claude-sonnet-4-6 (the DEADMAN agent's model).
const TF = process.env.TRUEFORGE_URL ?? "http://localhost:8790";
const sid = process.argv[2];
const model = process.argv[3] ?? "claude-sonnet-4-6";
if (!sid) { console.error("usage: node scripts/cost.mjs <session_id> [model]"); process.exit(2); }

// $ per 1M tokens (Anthropic pricing). Cache read ~0.1x input, cache write ~1.25x input.
const PRICE = {
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const p = PRICE[model] ?? PRICE["claude-sonnet-4-6"];

const turns = (await (await fetch(`${TF}/api/v1/sessions/${sid}/turns`)).json()).data || [];
const agg = { in: 0, out: 0, cr: 0, cw: 0, turns: turns.length };
for (const t of turns) {
  const m = (t.state && t.state.metrics) || t.metrics || {};
  agg.in += m.total_input_tokens || 0;
  agg.out += m.total_output_tokens || 0;
  agg.cr += m.total_cache_read_tokens || 0;
  agg.cw += m.total_cache_write_tokens || 0;
}
const regularIn = Math.max(0, agg.in - agg.cr - agg.cw);
const per = (n) => n / 1_000_000;
const inputCost = per(regularIn) * p.in + per(agg.cw) * p.in * 1.25 + per(agg.cr) * p.in * 0.1;
const outputCost = per(agg.out) * p.out;
const total = inputCost + outputCost;
const noCacheInput = per(agg.in) * p.in; // if nothing were cached
const savings = noCacheInput - (inputCost); // $ saved by prompt caching
const cacheHitPct = agg.in ? Math.round((100 * agg.cr) / agg.in) : 0;
const usd = (n) => "$" + n.toFixed(4);

console.log(`\nDEADMAN — session cost report  (${model})`);
console.log(`  session ${sid} · ${agg.turns} turn(s)`);
console.log(`  input tokens        ${agg.in.toLocaleString()}  (cache read ${agg.cr.toLocaleString()}, write ${agg.cw.toLocaleString()}, fresh ${regularIn.toLocaleString()})`);
console.log(`  output tokens       ${agg.out.toLocaleString()}`);
console.log(`  input cost          ${usd(inputCost)}`);
console.log(`  output cost         ${usd(outputCost)}`);
console.log(`  TOTAL               ${usd(total)}`);
console.log(`  prompt-cache hit    ${cacheHitPct}% of input  →  saved ${usd(savings)} vs no cache`);
console.log(`  → full week of dev at this per-incident cost is a rounding error vs the prize.\n`);
