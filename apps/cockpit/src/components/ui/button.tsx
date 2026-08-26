import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-border bg-card text-foreground/80 hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
};

export function Button({
  variant = "outline",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={cn(base, "px-3 py-1.5", variants[variant], className)} {...props}>
      {children}
    </button>
  );
}
