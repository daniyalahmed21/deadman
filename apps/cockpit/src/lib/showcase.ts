import { showcaseState, showcaseEvents, showcaseIncidents, showcaseCost, showcasePolicy } from "./showcaseData";

/**
 * Showcase mode: serve frozen REAL data (captured from a live engine run) instead of hitting a
 * backend. Enabled at build time with VITE_SHOWCASE=1 for the public Vercel deploy, which has no
 * engine or cluster to reach. The UI clearly labels it as demo data, so it never poses as live.
 */
export const SHOWCASE = import.meta.env.VITE_SHOWCASE === "1";

/** Frozen response for a polled dashboard endpoint, matched by path. */
export function showcasePoll<T>(url: string): T | null {
  if (url.includes("/incidents")) return showcaseIncidents as unknown as T;
  if (url.includes("/cost")) return showcaseCost as unknown as T;
  if (url.includes("/policy")) return showcasePolicy as unknown as T;
  return null;
}

export { showcaseState, showcaseEvents };
