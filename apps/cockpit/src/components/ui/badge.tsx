import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tier } from "@deadman/shared";

/** Tier -> soft pill: SAFE green, GATED amber, HARDLINE red. */
const tierClass: Record<Tier, string> = {
  SAFE: "bg-success/12 text-success",
  GATED: "bg-warning/12 text-warning",
  HARDLINE: "bg-destructive/12 text-destructive",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        tierClass[tier],
      )}
    >
      {tier}
    </span>
  );
}

/** Rounded status chip in the reference's "Done" / "Failed" style. */
export function StatusPill({ ok, okLabel = "Done", badLabel = "Failed" }: { ok: boolean; okLabel?: string; badLabel?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        ok ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
      )}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}
