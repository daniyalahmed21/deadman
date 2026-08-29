/**
 * Incident recall. Given a new alert, find the most similar past incident and the fix that
 * resolved it. TF-IDF + cosine over incident text (so rare, discriminative terms like OOMKilled
 * dominate over "the"), boosted by structured matches (same service, same signal) which are the
 * strongest signal for a semi-structured alert. No vector DB, no API key - deterministic and
 * demo-safe.
 *
 * Honest by design: only surfaces a match above threshold, hedges the strength by score, and
 * always names the source incident so a human can verify. A suggestion from memory, not a decision.
 */

import type { IncidentMemory } from "./memory.js";
import type { RecallMatch } from "@deadman/shared";

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "is", "was", "with", "its", "it"]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOP.has(t));
}

function buildIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)) + 1);
  return idf;
}

function tfidf(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const v = new Map<string, number>();
  for (const [t, f] of tf) v.set(t, (f / tokens.length) * (idf.get(t) ?? Math.log(2)));
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, y] of b) nb += y * y;
  for (const [t, x] of a) {
    const y = b.get(t);
    if (y) dot += x * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const strengthOf = (s: number): RecallMatch["strength"] => (s >= 0.7 ? "strong" : s >= 0.4 ? "likely" : "weak");

export interface AlertSketch {
  service: string;
  signal?: string;
  text: string;
}

const MIN_SCORE = 0.4;

/** Find the past incident most similar to `alert`, or null if nothing clears the threshold. */
export function recallSimilar(alert: AlertSketch, history: IncidentMemory[], min = MIN_SCORE): RecallMatch | null {
  const usable = history.filter((i) => i.fix.length > 0);
  if (usable.length < 2) return null; // cold start: too little memory to be useful

  const docTokens = usable.map((i) => tokenize(`${i.service} ${i.signal ?? ""} ${i.rootCause}`));
  const idf = buildIdf(docTokens);
  const qVec = tfidf(tokenize(`${alert.service} ${alert.signal ?? ""} ${alert.text}`), idf);

  let best: RecallMatch | null = null;
  usable.forEach((inc, i) => {
    let score = cosine(qVec, tfidf(docTokens[i] ?? [], idf));
    if (inc.service === alert.service) score += 0.25; // same service is a strong structured signal
    if (alert.signal && inc.signal === alert.signal) score += 0.35; // same failure mode
    score = Math.min(Number(score.toFixed(2)), 1);
    if (score >= min && (!best || score > best.score)) {
      best = {
        id: inc.id,
        service: inc.service,
        signal: inc.signal,
        rootCause: inc.rootCause,
        fix: inc.fix,
        score,
        strength: strengthOf(score),
        agoDays: Math.max(0, Math.round((Date.now() - inc.at) / 86_400_000)),
      };
    }
  });
  return best;
}
