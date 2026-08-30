import { useEffect, useRef, useState } from "react";
import type { DashboardState, MetricSample } from "@deadman/shared";
import { SHOWCASE, showcaseState } from "./showcase";

export interface DashboardFeed {
  state: DashboardState | null;
  online: boolean;
  series: MetricSample[];
}

/** Poll the engine's /dashboard/state and accumulate a memory/cpu time series client-side. */
export function useDashboard(intervalMs = 2000): DashboardFeed {
  const [state, setState] = useState<DashboardState | null>(null);
  const [online, setOnline] = useState(true);
  const [series, setSeries] = useState<MetricSample[]>([]);
  const seriesRef = useRef<MetricSample[]>([]);

  useEffect(() => {
    if (SHOWCASE) {
      setState(showcaseState);
      setOnline(true);
      const base: MetricSample = {
        ts: showcaseState.ts,
        memLimitMib: showcaseState.health.memLimitMib,
        workingSetMib: showcaseState.metrics.workingSetMib,
        cpuMillis: showcaseState.metrics.cpuMillis,
      };
      // Spread the captured sample across the chart width so the sparkline renders (no fabricated trend).
      setSeries(Array.from({ length: 12 }, (_, i) => ({ ...base, ts: base.ts - (11 - i) * intervalMs })));
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/dashboard/state");
        const j: DashboardState = await r.json();
        if (!alive) return;
        setState(j);
        setOnline(true);
        const sample: MetricSample = {
          ts: j.ts,
          memLimitMib: j.health.memLimitMib,
          workingSetMib: j.metrics.workingSetMib,
          cpuMillis: j.metrics.cpuMillis,
        };
        const next = [...seriesRef.current, sample].slice(-40);
        seriesRef.current = next;
        setSeries(next);
      } catch {
        if (alive) setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { state, online, series };
}
