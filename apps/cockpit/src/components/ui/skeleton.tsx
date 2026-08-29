import { cn } from "@/lib/utils";

/** A quiet loading placeholder - a soft pulsing block that matches the shape of what's coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
