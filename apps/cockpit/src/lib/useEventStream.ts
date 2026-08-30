import { useEffect, useState } from "react";
import type { AgentEvent } from "@deadman/shared";
import { SHOWCASE, showcaseEvents } from "./showcase";

/**
 * Subscribe to the engine's live agent-event stream (SSE). Replays recent history on connect,
 * then appends new events. Dedupes by seq so a reconnect/replay never doubles rows. Keeps the
 * last `max` events. Falls back silently if the stream is unavailable (the polling hooks still
 * drive the rest of the UI).
 */
export function useEventStream(max = 60): AgentEvent[] {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    if (SHOWCASE) {
      // Reveal the captured events one at a time so the feed animates in like a live stream.
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        setEvents(showcaseEvents.slice(Math.max(0, i - max), i));
        if (i >= showcaseEvents.length) clearInterval(id);
      }, 550);
      return () => clearInterval(id);
    }
    const es = new EventSource("/dashboard/stream");
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as AgentEvent;
        setEvents((prev) => {
          if (prev.some((p) => p.seq === e.seq)) return prev;
          return [...prev, e].slice(-max);
        });
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, [max]);

  return events;
}
