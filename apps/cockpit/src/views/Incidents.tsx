import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, StatusPill, TierBadge } from "@/components/ui/badge";
import { EvidenceList } from "@/components/ui/evidence";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { StatBlock, StatBlockSkeleton } from "@/components/ui/statblock";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoll } from "@/lib/usePoll";
import { cn, num } from "@/lib/utils";
import type { IncidentDetail } from "@deadman/shared";

const refusalsOf = (i: IncidentDetail) => i.timeline.filter((e) => e.isError).length;

export function Incidents() {
  const { data } = usePoll<{ incidents: IncidentDetail[] }>("/dashboard/incidents", 4000);
  const incidents = useMemo(() => data?.incidents ?? [], [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && incidents.length) setSelectedId(incidents[0].id);
  }, [incidents, selectedId]);

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Incidents" subtitle="History and replay" />
        <StatBlockSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const resolvedCount = incidents.filter((i) => i.resolved).length;
  const totalRefused = incidents.reduce((s, i) => s + refusalsOf(i), 0);
  const totalActions = incidents.reduce((s, i) => s + i.timeline.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Incidents" subtitle="History and replay" />

      <StatBlock
        cells={[
          { label: "Total", value: num(incidents.length), foot: "worked" },
          { label: "Resolved", value: num(resolvedCount), foot: "closed", delta: { text: "all clear", tone: "up" } },
          { label: "Actions", value: num(totalActions), foot: "executed" },
          { label: "Refused", value: num(totalRefused), foot: "by floor", delta: totalRefused ? { text: "held", tone: "up" } : undefined },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* History list */}
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>All incidents</CardTitle>
            <span className="text-xs tabular-nums text-muted-foreground">{num(incidents.length)}</span>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <p className="px-5 pb-5 text-sm italic text-muted-foreground">No incidents recorded</p>
            ) : (
              <ul>
                {incidents.map((i) => {
                  const refs = refusalsOf(i);
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => setSelectedId(i.id)}
                        className={cn(
                          "flex w-full items-center gap-3 border-t px-5 py-3.5 text-left transition-colors duration-200 ease-out first:border-t-0 hover:bg-muted/50",
                          i.id === selectedId && "bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium capitalize">{i.service}</div>
                          <div className="truncate text-[13px] text-muted-foreground" title={i.rootCause}>
                            {i.rootCause}
                          </div>
                        </div>
                        <div className="hidden shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                          {num(i.timeline.length)} action{i.timeline.length === 1 ? "" : "s"}
                          {refs > 0 && <span className="text-destructive"> · {num(refs)} refused</span>}
                        </div>
                        {i.isNoise ? (
                          <Pill className="shrink-0 bg-muted text-muted-foreground">Noise</Pill>
                        ) : (
                          <StatusPill ok={i.resolved} okLabel="Resolved" badLabel="Open" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {selected ? <IncidentDetailPanel incident={selected} /> : null}
      </div>
    </div>
  );
}

function IncidentDetailPanel({ incident }: { incident: IncidentDetail }) {
  const [step, setStep] = useState(incident.timeline.length);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStep(incident.timeline.length);
    setPlaying(false);
  }, [incident.id, incident.timeline.length]);

  useEffect(() => {
    if (!playing) return;
    if (step >= incident.timeline.length) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(id);
  }, [playing, step, incident.timeline.length]);

  const replay = () => {
    setStep(0);
    setPlaying(true);
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="capitalize">{incident.service} incident</CardTitle>
          <div className="mt-0.5 truncate text-xs text-muted-foreground" title={incident.id}>{incident.id}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" onClick={replay}>
            <Play className="h-3 w-3" /> Replay
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPlaying(false);
              setStep(incident.timeline.length);
            }}
          >
            <RotateCcw className="h-3 w-3" /> All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{incident.rootCause}</p>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Validity" value={num(incident.validity)} />
          <Stat label="Before" value={incident.memLimitBefore ? `${num(incident.memLimitBefore)}Mi` : "-"} />
          <Stat label="After" value={incident.memLimitAfter ? `${num(incident.memLimitAfter)}Mi` : "-"} />
        </div>

        {incident.evidence.length > 0 && (
          <div className="border-t pt-4">
            <EvidenceList items={incident.evidence} columns={1} />
          </div>
        )}

        <div className="border-t pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Action timeline</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{num(incident.timeline.length)} steps</span>
          </div>
          {incident.timeline.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No mutating actions</p>
          ) : (
            <ol className="space-y-2">
              {incident.timeline.slice(0, step).map((e, i) => (
                <motion.li
                  key={e.seq}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                >
                  <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <TierBadge tier={e.tier} />
                  <span className="text-sm">
                    <span className="font-medium">{e.action}</span>{" "}
                    <span className="text-muted-foreground">{e.target}</span>
                  </span>
                  <span className="ml-auto">
                    <StatusPill ok={!e.isError} okLabel="Done" badLabel="Refused" />
                  </span>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2.5 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
