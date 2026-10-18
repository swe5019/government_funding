"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUsd, formatUsdCompact } from "@/lib/format";
import { AXIS_TICK, TooltipCard } from "./shared";

export interface BarDatum {
  label: string;
  value: number;
}

const truncate = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Horizontal bars, value at the tip. Single series, sorted largest first. */
export function AgencyBars({ data, label = "Net obligations" }: { data: BarDatum[]; label?: string }) {
  const height = Math.max(56, data.length * 36 + 16);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={`${label} by awarding agency, bar chart. Table view below.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={180}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => truncate(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(payload[0].payload.label)}
                  rows={[{ label, value: formatUsd(Number(payload[0].value)), swatch: "var(--series-1)" }]}
                />
              ) : null
            }
          />
          <Bar dataKey="value" fill="var(--series-1)" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => formatUsdCompact(Number(v))}
              style={{ fill: "var(--fg)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
