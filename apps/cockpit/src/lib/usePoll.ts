import { useEffect, useRef, useState } from "react";

export interface Poll<T> {
  data: T | null;
  online: boolean;
}

/**
 * Poll a same-origin JSON endpoint on an interval. Keeps the last good value on transient
 * errors and flips `online` false so the UI can show a disconnected state without blanking.
 */
export function usePoll<T>(url: string, intervalMs = 3000): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [online, setOnline] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as T;
        if (!alive.current) return;
        setData(json);
        setOnline(true);
      } catch {
        if (alive.current) setOnline(false);
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, online };
}
