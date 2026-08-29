import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatCell {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  foot?: ReactNode;
  /** small right-aligned delta under the value, e.g. a percentage */
  delta?: { text: string; tone: "up" | "down" | "flat" };
}

/** Responsive column counts: stack tighter on small screens, full row on large. */
const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

/** Capitalize the first letter only, so acronyms mid-string (SAFE tier) stay intact. */
const sentence = (v: ReactNode): ReactNode =>
  typeof v === "string" && v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;

/** Loading placeholder shaped like the dark KPI block. */
export function StatBlockSkeleton({ cells = 4 }: { cells?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-panel-border lg:grid-cols-4">
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="space-y-3 bg-panel px-5 py-4">
          <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
          <div className="h-6 w-12 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-20 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * The signature dark KPI block: one rounded near-black panel holding evenly divided cells.
 * Big white figures, a muted foot line, and an optional colored delta - mirrors the reference.
 * Columns collapse responsively so cells never overflow on narrow screens.
 */
export function StatBlock({ cells }: { cells: StatCell[] }) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-2xl bg-panel-border ${COLS[cells.length] ?? "grid-cols-2 lg:grid-cols-4"}`}>
      {cells.map((c) => (
        <div key={c.label} className="bg-panel px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-panel-foreground/70">
            {c.icon}
            <span>{c.label}</span>
          </div>
          <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-panel-foreground tabular-nums">
            {c.value}
          </div>
          {(c.foot || c.delta) && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-panel-foreground/55">{sentence(c.foot)}</span>
              {c.delta && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                    c.delta.tone === "up" && "bg-success/15 text-success",
                    c.delta.tone === "down" && "bg-destructive/15 text-destructive",
                    c.delta.tone === "flat" && "bg-white/8 text-panel-foreground/70",
                  )}
                >
                  {sentence(c.delta.text)}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
