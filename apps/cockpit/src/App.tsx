import { useState } from "react";
import { Menu, Skull } from "lucide-react";
import { Sidebar, type View } from "@/components/Sidebar";
import { Overview } from "@/views/Overview";
import { Incidents } from "@/views/Incidents";
import { Safety } from "@/views/Safety";
import { Cost } from "@/views/Cost";
import { useDashboard } from "@/lib/useDashboard";
import { SHOWCASE } from "@/lib/showcase";

const TITLES: Record<View, string> = {
  overview: "Overview",
  incidents: "Incidents",
  safety: "Safety",
  cost: "Cost",
};

export function App() {
  const [view, setView] = useState<View>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const feed = useDashboard();

  const navigate = (v: View) => {
    setView(v);
    setMobileOpen(false); // close the drawer after choosing on mobile
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        setView={navigate}
        online={feed.online}
        backend={feed.state?.mode}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {SHOWCASE && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
            Demo data. A frozen snapshot of a real incident run. Clone the repo and run the engine for a live cluster.
          </div>
        )}
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Skull className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">{TITLES[view]}</span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6">
          {view === "overview" && <Overview feed={feed} />}
          {view === "incidents" && <Incidents />}
          {view === "safety" && <Safety />}
          {view === "cost" && <Cost />}
        </main>
      </div>
    </div>
  );
}
