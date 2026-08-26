import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, TierBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import { StatBlock } from "@/components/ui/statblock";
import { Donut } from "@/components/ui/donut";
import { usePoll } from "@/lib/usePoll";
import { num } from "@/lib/utils";
import type { AuditEntry, IncidentDetail, Policy, Tier } from "@deadman/shared";

export function Safety() {
  const { data: policy } = usePoll<Policy>("/dashboard/policy", 10000);
  const { data: incData } = usePoll<{ incidents: IncidentDetail[] }>("/dashboard/incidents", 4000);

  const actions = useMemo<AuditEntry[]>(
    () => (incData?.incidents ?? []).flatMap((i) => i.timeline),
    [incData],
  );
  const refused = actions.filter((a) => a.isError);
  const byTier = (t: Tier) => actions.filter((a) => a.tier === t).length;

  const slices = [
    { label: "SAFE", value: byTier("SAFE"), color: "var(--success)" },
    { label: "GATED", value: byTier("GATED"), color: "var(--warning)" },
    { label: "Refused", value: refused.length, color: "var(--destructive)" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Safety" subtitle="Frozen, fail-closed blast-radius policy" />

      <StatBlock
        cells={[
          { label: "Attempted", value: num(actions.length), foot: "mutations" },
          { label: "Auto-run", value: num(byTier("SAFE")), foot: "SAFE tier", delta: { text: "no gate", tone: "up" } },
          { label: "Gated", value: num(byTier("GATED")), foot: "approval" },
          { label: "Refused", value: num(refused.length), foot: "by floor", delta: refused.length ? { text: "held", tone: "up" } : undefined },
        ]}
      />

      {/* Policy tiers */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {policy?.tiers.map((tier) => (
          <Card key={tier.tier}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <TierBadge tier={tier.tier} />
              <span className="text-xs tabular-nums text-muted-foreground">{num(byTier(tier.tier))} run</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{tier.behavior}</p>
              <div className="flex flex-wrap gap-1.5">
                {tier.tools.map((tool) => (
                  <Pill key={tool} className="bg-muted font-mono text-[11px] text-foreground/70">
                    {tool}
                  </Pill>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Decision distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut slices={slices} total={actions.length} caption="actions" />
            <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
              {slices.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label} {num(s.value)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Refusals - the second-layer floor in action */}
        <Card>
          <CardHeader>
            <CardTitle>Refused actions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {refused.length === 0 ? (
              <p className="px-5 pb-5 text-sm italic text-muted-foreground">Nothing refused</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2 pl-5 pr-3 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="py-2 pl-3 pr-5 text-left font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {refused.map((e) => (
                    <tr key={e.seq} className="border-t">
                      <td className="py-3 pl-5 pr-3">
                        <TierBadge tier={e.tier} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className="font-medium">{e.action}</span>{" "}
                        <span className="text-muted-foreground">{e.target}</span>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-muted-foreground">{e.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hardline patterns */}
      {policy?.hardlinePatterns?.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Hardline patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {policy.hardlinePatterns.map((p) => (
                <Pill key={p} className="bg-destructive/10 font-mono text-[11px] text-destructive">
                  {p}
                </Pill>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
