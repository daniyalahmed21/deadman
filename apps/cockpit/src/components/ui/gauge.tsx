import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from "recharts";

/**
 * A radial utilization gauge (0-100%). Fills teal, flips to coral past the danger threshold.
 * The center holds a caption supplied by the caller (e.g. "451 / 512 Mi").
 */
export function Gauge({
  pct,
  danger = 90,
  caption,
  sub,
}: {
  pct: number;
  danger?: number;
  caption: string;
  sub?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= danger ? "var(--destructive)" : "var(--success)";
  return (
    <div className="relative h-40">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={[{ value: clamped }]}
          startAngle={220}
          endAngle={-40}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} fill={color} background={{ fill: "var(--muted)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {Math.round(clamped)}%
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">{caption}</div>
        {sub && <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}
