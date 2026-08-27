import { useState } from "react";
import { Play, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Scenario = "oom" | "crashloop" | "imagepull";

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: "oom", label: "OOMKilled" },
  { key: "crashloop", label: "CrashLoop" },
  { key: "imagepull", label: "ImagePull" },
];

/** Demo trigger: injects a failure and drives the full autonomous cycle (watch the Live feed). */
export function DemoControls() {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async (scenario: Scenario) => {
    setOpen(false);
    setBusy(true);
    try {
      await fetch(`/dashboard/demo-run?scenario=${scenario}`, { method: "POST" });
    } catch {
      /* engine offline - ignore */
    }
    // Re-enable after the run's paced duration (~9s).
    setTimeout(() => setBusy(false), 9000);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Button variant="primary" disabled={busy} onClick={() => run("oom")}>
          {busy ? <Zap className="h-3 w-3 animate-pulse" /> : <Play className="h-3 w-3" />}
          {busy ? "Running" : "Simulate incident"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setOpen((o) => !o)} aria-label="Choose scenario">
          <span className="text-xs">▾</span>
        </Button>
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border bg-card shadow-sm">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => run(s.key)}
              className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-muted")}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
