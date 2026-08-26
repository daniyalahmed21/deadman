import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** A compact donut with a centered total. Zero-value slices are dropped so it never looks broken. */
export function Donut({ slices, total, caption }: { slices: DonutSlice[]; total: number; caption: string }) {
  const data = slices.filter((s) => s.value > 0);
  return (
    <div className="relative h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none">
            {data.map((s) => (
              <Cell key={s.label} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums">{total}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{caption}</div>
      </div>
    </div>
  );
}
