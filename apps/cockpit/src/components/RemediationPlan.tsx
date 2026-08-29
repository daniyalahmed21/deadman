import { ArrowRight, FlaskConical, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, TierBadge } from "@/components/ui/badge";
import { num } from "@/lib/utils";
import type { BlastRadius, Insights } from "@deadman/shared";

const SEV: Record<BlastRadius["severity"], string> = {
  low: "bg-success/12 text-success",
  medium: "bg-warning/12 text-warning",
  high: "bg-destructive/12 text-destructive",
};

/** The last path segment - "spec...limits.memory" -> "memory", "spec.replicas" -> "replicas". */
const leaf = (p: string) => p.split(/[.\]]/).filter(Boolean).pop() ?? p;

/**
 * The agent's remediation plan: the recalled proven fix, the approval-gate diff (what changes,
 * blast radius, rollback), and the sandbox-rehearsal verdict - the "approve with full context" panel.
 */
export function RemediationPlan({ insights }: { insights: Insights }) {
  const { recommendedAction, recall, preview, rehearsal } = insights;
  if (!recommendedAction || !preview) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Remediation plan</CardTitle>
        <div className="flex items-center gap-2">
          <TierBadge tier={preview.tier} />
          <span className="font-mono text-xs text-muted-foreground">{recommendedAction}</span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Recalled fix */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Recalled fix
          </div>
          {recall ? (
            <div className="text-sm">
              <div className="font-medium">{recall.fix.join(", ")}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                proven in {recall.id} · {num(recall.agoDays)}d ago · {recall.strength} match
              </div>
            </div>
          ) : (
            <div className="text-sm italic text-muted-foreground">no prior match in memory</div>
          )}
        </div>

        {/* Approval diff */}
        <div className="lg:border-x lg:px-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">What changes</div>
          <div className="space-y-1 font-mono text-[13px]">
            {preview.changes.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted-foreground">{leaf(c.path)}</span>
                <span>{String(c.before)}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">{String(c.after)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Pill className={SEV[preview.blastRadius.severity]}>{preview.blastRadius.severity} risk</Pill>
            <Pill className="bg-muted text-muted-foreground">{preview.blastRadius.reversible ? "reversible" : "irreversible"}</Pill>
            <Pill className="bg-muted text-muted-foreground">
              {num(preview.blastRadius.podsAffected)} pods · {preview.blastRadius.disruption}
            </Pill>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            rollback: {preview.rollback ? preview.rollback.inverse : "none (irreversible)"}
          </div>
        </div>

        {/* Sandbox rehearsal */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> Sandbox rehearsal
          </div>
          {rehearsal?.rehearsed ? (
            <>
              <Pill className={rehearsal.pass ? "bg-success/12 text-success" : "bg-warning/12 text-warning"}>
                {rehearsal.pass ? "PASS" : "FAIL"}
              </Pill>
              <div className="mt-1.5 text-xs text-muted-foreground">
                fork {num(rehearsal.before.memLimitMib)}Mi → {num(rehearsal.after.memLimitMib)}Mi ·{" "}
                {rehearsal.after.healthy ? "healthy" : "still unhealthy"}
              </div>
            </>
          ) : (
            <div className="text-sm italic text-muted-foreground">{rehearsal?.detail ?? "not rehearsed"}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
