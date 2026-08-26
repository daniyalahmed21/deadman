import type { ReactNode } from "react";
import { Activity, Cpu, Gauge as GaugeIcon, ShieldX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, StatusPill, TierBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import { StatBlock } from "@/components/ui/statblock";
import { Gauge } from "@/components/ui/gauge";
import type { DashboardFeed } from "@/lib/useDashboard";
import { num } from "@/lib/utils";
import type { Phase } from "@deadman/shared";

const PHASES: { key: Phase; label: string }[] = [
  { key: "triage", label: "Triage" },
  { key: "investigate", label: "Investigate" },
  { key: "remediate", label: "Remediate" },
  { key: "verify", label: "Verify" },
];

export function Overview({ feed }: { feed: DashboardFeed }) {
  const { state, online } = feed;

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
        actions={<StatusPill ok={resolved} okLabel="Resolved" badLabel={online ? "Firing" : "Offline"} />}
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

      {/* Phase strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PHASES.map((p) => {
          const isActive = p.key === active;
          const isDone = done[p.key];
          return (
            <div
              key={p.key}
              className={[
                "rounded-xl border bg-card px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider transition-colors",
                isActive ? "border-foreground text-foreground" : isDone ? "text-success" : "text-muted-foreground",
              ].join(" ")}
            >
              {p.label}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Root cause */}
        <Card>
          <CardHeader>
            <CardTitle>Root cause</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inv ? (
              <>
                <p className="text-sm leading-relaxed">{inv.root_cause}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {inv.is_noise ? (
                    <Pill className="bg-muted text-muted-foreground">Noise</Pill>
                  ) : (
                    <Pill className="bg-destructive/12 text-destructive">Real incident</Pill>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground">validity {num(inv.validity_score)}</span>
                </div>
                <ul className="space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
                  {inv.evidence.slice(0, 3).map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-success">-</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm italic text-muted-foreground">Awaiting investigation</p>
            )}
          </CardContent>
        </Card>

        {/* Memory gauge */}
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

        {/* Action log */}
        <Card>
          <CardHeader>
            <CardTitle>Action log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {audit.length === 0 ? (
              <p className="px-5 pb-5 text-sm italic text-muted-foreground">No actions yet</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.seq} className="border-t first:border-t-0">
                      <td className="py-3 pl-5 pr-3">
                        <TierBadge tier={e.tier} />
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium">{e.action}</span>{" "}
                        <span className="text-muted-foreground">{e.target}</span>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <StatusPill ok={!e.isError} okLabel="Done" badLabel="Refused" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
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
