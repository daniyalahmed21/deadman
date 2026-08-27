import type { LucideIcon } from "lucide-react";
import { Activity, Ban, CheckCircle2, RotateCcw, Search, ShieldCheck, Wrench } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AgentEvent, EventKind, EventSeverity } from "@deadman/shared";

const ICON: Record<EventKind, LucideIcon> = {
  phase: Search,
  signal: Activity,
  proposal: Wrench,
  gate: ShieldCheck,
  action: Wrench,
  refusal: Ban,
  verify: Activity,
  rollback: RotateCcw,
  resolved: CheckCircle2,
};

const TONE: Record<EventSeverity, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  danger: "text-destructive",
  success: "text-success",
};

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Live agent activity: the event stream rendered newest-first with severity-toned markers. */
export function LiveFeed({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return <p className="px-5 pb-5 text-sm italic text-muted-foreground">Waiting for agent activity</p>;
  }
  const ordered = [...events].reverse();
  return (
    <ul className="max-h-[420px] overflow-y-auto">
      {ordered.map((e) => {
        const Icon = ICON[e.kind];
        return (
          <motion.li
            key={e.seq}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 border-t px-5 py-2.5 first:border-t-0"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[e.severity])} strokeWidth={2} />
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{e.message}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{time(e.ts)}</span>
          </motion.li>
        );
      })}
    </ul>
  );
}
