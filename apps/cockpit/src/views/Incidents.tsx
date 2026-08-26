import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill, TierBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { StatBlock } from "@/components/ui/statblock";
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
        {/* History table */}
        <Card>
          <CardHeader>
            <CardTitle>All incidents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <p className="px-5 pb-5 text-sm italic text-muted-foreground">No incidents recorded</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2 pl-5 pr-3 text-left font-medium">Service</th>
                    <th className="px-3 py-2 text-left font-medium">Root cause</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i) => (
                    <tr
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                      className={cn(
                        "cursor-pointer border-t transition-colors hover:bg-muted/60",
                        i.id === selectedId && "bg-muted",
                      )}
                    >
                      <td className="py-3 pl-5 pr-3 font-medium">{i.service}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground" title={i.rootCause}>
                        {i.rootCause}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {num(i.timeline.length)}
                        {refusalsOf(i) > 0 && <span className="ml-1 text-destructive">({num(refusalsOf(i))})</span>}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        {i.isNoise ? (
                          <StatusPill ok={false} badLabel="Noise" />
                        ) : (
                          <StatusPill ok={i.resolved} okLabel="Resolved" badLabel="Open" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{incident.id}</CardTitle>
        <div className="flex items-center gap-2">
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
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{incident.rootCause}</p>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Validity" value={num(incident.validity)} />
          <Stat label="Mem before" value={incident.memLimitBefore ? `${num(incident.memLimitBefore)}Mi` : "-"} />
          <Stat label="Mem after" value={incident.memLimitAfter ? `${num(incident.memLimitAfter)}Mi` : "-"} />
        </div>

        {incident.evidence.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {incident.evidence.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-success">-</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Action timeline</div>
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
