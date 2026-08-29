import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Activity, ShieldCheck, ListTree, Coins, LogOut, Skull, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type View = "overview" | "incidents" | "safety" | "cost";

const NAV: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "incidents", label: "Incidents", icon: ListTree },
  { key: "safety", label: "Safety", icon: ShieldCheck },
  { key: "cost", label: "Cost", icon: Coins },
];

export function Sidebar({
  view,
  setView,
  online,
  backend,
  mobileOpen = false,
  onCloseMobile,
}: {
  view: View;
  setView: (v: View) => void;
  online: boolean;
  backend?: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "z-50 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200",
          // Mobile: fixed off-canvas drawer at full width, slides in/out.
          "fixed inset-y-0 left-0 w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static in-flow, collapsible width, always visible.
          "lg:static lg:translate-x-0 lg:transition-[width]",
          collapsed ? "lg:w-[68px]" : "lg:w-60",
        )}
      >
      {/* Brand + collapse toggle */}
      <div className={cn("flex items-center pt-5 pb-6", collapsed ? "justify-center px-0" : "gap-3 px-5")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Skull className="h-5 w-5" strokeWidth={2} />
        </div>
        {!collapsed && (
          <>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">DEADMAN</div>
              <div className="text-xs text-muted-foreground">AI SRE</div>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="ml-auto hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:block"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-auto mb-3 hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:block"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Nav */}
      <nav className={cn("flex flex-col gap-1", collapsed ? "px-2.5" : "px-3")}>
        {NAV.map(({ key, label, icon: Icon }) => {
          const isActive = view === key;
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-xl text-sm transition-colors duration-200 ease-out",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              {!collapsed && label}
            </button>
          );
        })}
      </nav>

      {/* Operator footer */}
      <div className={cn("mt-auto border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs">
            <span className="text-muted-foreground">Engine</span>
            <span className={online ? "font-medium text-success" : "font-medium text-destructive"}>
              {online ? `live · ${backend ?? "sim"}` : "offline"}
            </span>
          </div>
        )}

        <div
          className={cn("flex items-center py-1.5", collapsed ? "justify-center px-0" : "gap-3 px-2")}
          title={collapsed ? `On-call operator · engine ${online ? "live" : "offline"}` : undefined}
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            OC
            {collapsed && (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar",
                  online ? "bg-success" : "bg-destructive",
                )}
              />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium leading-tight">On-call operator</div>
              <div className="truncate text-xs leading-tight text-muted-foreground">Approvals owner</div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/")}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "mt-1 flex items-center rounded-xl text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
            collapsed ? "w-full justify-center py-2" : "w-full gap-2 px-3 py-2",
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && "Log out"}
        </button>
      </div>
      </aside>
    </>
  );
}
