import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import { StatBlock } from "@/components/ui/statblock";
import { Donut } from "@/components/ui/donut";
import { usePoll } from "@/lib/usePoll";
import { num } from "@/lib/utils";
import type { CostReport } from "@deadman/shared";

const money = (n: number) => `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;

export function Cost() {
  const { data } = usePoll<CostReport>("/dashboard/cost", 5000);

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Cost" subtitle="Token usage and spend" />
        <p className="text-sm italic text-muted-foreground">Loading</p>
      </div>
    );
  }

  const deterministic = Math.max(0, data.investigations - data.llmCalls);
  const perIncident = data.perIncident.map((p) => ({ name: p.service, tokens: p.inputTokens + p.outputTokens }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cost"
        subtitle="Metered from real API usage"
        actions={<Pill className="bg-muted font-mono text-[11px] text-muted-foreground">{data.model}</Pill>}
      />

      <StatBlock
        cells={[
          { label: "Investigations", value: num(data.investigations), foot: "total runs" },
          { label: "LLM calls", value: num(data.llmCalls), foot: "hit the model" },
          { label: "Tokens", value: num(data.inputTokens + data.outputTokens), foot: "in + out" },
          { label: "Spend", value: money(data.usd), foot: "this session", delta: { text: data.usd === 0 ? "free" : "billed", tone: data.usd === 0 ? "up" : "flat" } },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Execution mix */}
        <Card>
          <CardHeader>
            <CardTitle>Execution mix</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut
              slices={[
                { label: "Deterministic", value: deterministic, color: "var(--success)" },
                { label: "LLM", value: data.llmCalls, color: "var(--warning)" },
              ]}
              total={data.investigations}
              caption="runs"
            />
            <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" /> Deterministic {num(deterministic)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning" /> LLM {num(data.llmCalls)}
              </span>
            </div>
          </CardContent>
        </Card>

        {data.narration ? (
          <Card>
            <CardHeader>
              <CardTitle>Tokens by incident</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perIncident} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "var(--panel)", border: "none", borderRadius: 10, fontSize: 12, color: "var(--panel-foreground)" }}
                      formatter={(v: number) => [num(v), "tokens"]}
                      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    />
                    <Bar dataKey="tokens" radius={[6, 6, 0, 0]}>
                      {perIncident.map((_, i) => (
                        <Cell key={i} fill="var(--primary)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Pricing model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Root cause runs on live signals. The model only narrates when a key is present, so current spend
                is {money(0)}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted px-4 py-3">
                  <div className="text-xl font-semibold tabular-nums">{money(data.priceInPerMTok)}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">per M input</div>
                </div>
                <div className="rounded-xl bg-muted px-4 py-3">
                  <div className="text-xl font-semibold tabular-nums">{money(data.priceOutPerMTok)}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">per M output</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
