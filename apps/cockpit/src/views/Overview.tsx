import type { ReactNode } from "react";
import { Activity, Check, Cpu, Gauge as GaugeIcon, GitCommitVertical, ShieldX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, StatusPill } from "@/components/ui/badge";
import { EvidenceList } from "@/components/ui/evidence";
import { PageHeader } from "@/components/ui/page";
import { StatBlock } from "@/components/ui/statblock";
import { Gauge } from "@/components/ui/gauge";
import { LiveFeed } from "@/components/LiveFeed";
import { DemoControls } from "@/components/DemoControls";
import type { DashboardFeed } from "@/lib/useDashboard";
import { useEventStream } from "@/lib/useEventStream";
import { cn, num } from "@/lib/utils";
import type { Phase } from "@deadman/shared";

const PHASES: { key: Phase; label: string }[] = [
  { key: "triage", label: "Triage" },
  { key: "investigate", label: "Investigate" },
  { key: "remediate", label: "Remediate" },
  { key: "verify", label: "Verify" },
];

export function Overview({ feed }: { feed: DashboardFeed }) {
  const { state, online } = feed;
  const events = useEventStream();

  const inv = state?.investigation ?? null;
  const audit = state?.audit ?? [];
  const refused = audit.filter((a) => a.isError).length;
  const investigated = !!inv;
  const acted = audit.length > 0;
  const resolved = !!state?.resolved;
  const active: Phase = !investigated ? "triage" : !acted ? "investigate" : !resolved ? "remediate" : "verify";
  const done: Record<Phase, boolean> = {
    triage: investigated || acted,
    investigate: investigated,
    remediate: acted,
    verify: resolved,
  };

  const limit = state?.health.memLimitMib ?? 0;
  const ws = state?.metrics.workingSetMib ?? 0;
  const memPct = limit ? Math.round((100 * ws) / limit) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        subtitle={state ? `${state.service} · ${state.mode} backend` : "connecting"}
        actions={
          <div className="flex items-center gap-3">
            <StatusPill ok={resolved} okLabel="Resolved" badLabel={online ? "Firing" : "Offline"} />
            <DemoControls />
          </div>
        }
      />

      <StatBlock
        cells={[
          {
            label: "Status",
            icon: <Activity className="h-3.5 w-3.5" />,
            value: resolved ? "Healthy" : "Degraded",
            foot: inv?.is_noise ? "flagged noise" : "real incident",
          },
          {
            label: "Memory used",
            icon: <GaugeIcon className="h-3.5 w-3.5" />,
            value: `${num(memPct)}%`,
            foot: `${num(ws)} / ${num(limit)} Mi`,
            delta: { text: `${num(limit - ws)} Mi free`, tone: memPct >= 90 ? "down" : "up" },
          },
          {
            label: "Actions",
            icon: <Cpu className="h-3.5 w-3.5" />,
            value: num(audit.length),
            foot: "this session",
          },
          {
            label: "Refused",
            icon: <ShieldX className="h-3.5 w-3.5" />,
            value: num(refused),
            foot: "by safety floor",
            delta: refused ? { text: "floor held", tone: "up" } : undefined,
          },
        ]}
      />

      {/* Asymmetric layout: wide narrative + activity column, right rail of live vitals + progress */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column (wide) */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {/* Root cause */}
          <Card>
            <CardHeader>
              <CardTitle>Root cause</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inv ? (
                <>
                  <p className="text-[15px] leading-relaxed">{inv.root_cause}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {inv.is_noise ? (
                      <Pill className="bg-muted text-muted-foreground">Noise</Pill>
                    ) : (
                      <Pill className="bg-destructive/12 text-destructive">Real incident</Pill>
                    )}
                    <span className="tabular-nums">validity {num(inv.validity_score)}</span>
                  </div>

                  {inv.change?.suspected && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
                      <GitCommitVertical className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div className="min-w-0 text-[13px] leading-snug">
                        <span className="font-medium text-warning">Suspected change</span>{" "}
                        <span className="text-muted-foreground">
                          rev {num(inv.change.suspected.revision)} · {inv.change.suspected.summary} ·{" "}
                          {num(inv.change.minutesBefore ?? 0)}m before onset · {num(Math.round(inv.change.confidence * 100))}%
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <EvidenceList
                      items={inv.evidence.filter(
                        (e) =>
                          !e.startsWith("suspected change") &&
                          !(inv.change?.suspected && /no correlated deploy|no correlated/i.test(e)),
                      )}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm italic text-muted-foreground">Awaiting investigation</p>
              )}
            </CardContent>
          </Card>

          {/* Live activity (event stream) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Live activity</CardTitle>
              <span className={cn("text-[11px] font-medium", online ? "text-success" : "text-muted-foreground")}>
                {online ? "streaming" : "offline"}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <LiveFeed events={events} />
            </CardContent>
          </Card>
        </div>

        {/* Right rail: live vitals + investigation progress */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memory pressure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Gauge pct={memPct} caption={`${num(ws)} / ${num(limit)} Mi`} />
              <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">working set vs limit</p>
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <MiniStat label="Replicas" value={num(state?.health.replicas ?? 0)} />
                <MiniStat label="CPU" value={`${num(state?.metrics.cpuMillis ?? 0)}m`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Investigation</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ol className="relative">
                {PHASES.map((p, i) => {
                  const isActive = p.key === active;
                  const isDone = done[p.key];
                  const isLast = i === PHASES.length - 1;
                  return (
                    <li key={p.key} className="flex gap-3 pb-4 last:pb-0">
                      <div className="relative flex flex-col items-center">
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            isDone
                              ? "bg-success/15 text-success"
                              : isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        {!isLast && (
                          <span className={cn("mt-1 w-px flex-1", isDone ? "bg-success/40" : "bg-border")} />
                        )}
                      </div>
                      <div className="flex flex-1 items-center justify-between pt-0.5">
                        <span
                          className={cn(
                            "text-sm",
                            isActive ? "font-medium text-foreground" : isDone ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {p.label}
                        </span>
                        {isActive && !resolved && <span className="text-[11px] text-primary">in progress</span>}
                        {isDone && <span className="text-[11px] text-success">done</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
