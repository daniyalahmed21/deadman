/**
 * Demo mode — one switch for a bulletproof recording. When DEADMAN_DEMO_MODE is on it forces
 * the deterministic sim backend, disables LLM narration, and pins the OOM scenario, regardless
 * of the other DEADMAN_* env vars. So a single flag guarantees an identical run every take.
 */
export function demoMode(): boolean {
  const v = (process.env.DEADMAN_DEMO_MODE ?? "").toLowerCase();
  return v === "1" || v === "on" || v === "true" || v === "yes";
}
