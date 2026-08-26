/**
 * LLM cost accounting. Every investigation counts; the ones that actually reach Claude
 * (narration on, key present) record their token usage from res.usage. Deterministic runs
 * cost nothing and are reported as such - the numbers here are real, not estimated.
 *
 * Pricing is the published Opus 4.x rate; override per env if the model changes.
 */

const MODEL = process.env.DEADMAN_LLM_MODEL ?? "claude-opus-4-8";
const PRICE_IN = Number(process.env.DEADMAN_PRICE_IN ?? 15); // USD per 1M input tokens
const PRICE_OUT = Number(process.env.DEADMAN_PRICE_OUT ?? 75); // USD per 1M output tokens

interface Usage {
  service: string;
  inputTokens: number;
  outputTokens: number;
  at: number;
}

const usages: Usage[] = [];
let investigations = 0;

export function usd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * PRICE_IN + (outputTokens / 1e6) * PRICE_OUT;
}

/** Count one investigation (LLM or deterministic). */
export function recordInvestigation(): void {
  investigations += 1;
}

/** Record real token usage from an Anthropic response. */
export function recordUsage(service: string, inputTokens: number, outputTokens: number): void {
  usages.push({ service, inputTokens, outputTokens, at: Date.now() });
}

export function costReport() {
  const inputTokens = usages.reduce((s, u) => s + u.inputTokens, 0);
  const outputTokens = usages.reduce((s, u) => s + u.outputTokens, 0);

  const byService = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const u of usages) {
    const cur = byService.get(u.service) ?? { inputTokens: 0, outputTokens: 0 };
    cur.inputTokens += u.inputTokens;
    cur.outputTokens += u.outputTokens;
    byService.set(u.service, cur);
  }
  // Usage is metered per service (the LLM step only knows the service), so this is a
  // per-service breakdown - not per-incident, since one service can have many incidents.
  const perService = [...byService.entries()].map(([service, t]) => ({
    service,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    usd: usd(t.inputTokens, t.outputTokens),
  }));

  return {
    model: MODEL,
    narration: usages.length > 0,
    investigations,
    llmCalls: usages.length,
    inputTokens,
    outputTokens,
    usd: usd(inputTokens, outputTokens),
    priceInPerMTok: PRICE_IN,
    priceOutPerMTok: PRICE_OUT,
    perService,
  };
}

export function resetCost(): void {
  usages.length = 0;
  investigations = 0;
}
