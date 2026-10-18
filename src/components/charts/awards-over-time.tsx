"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUsd } from "@/lib/format";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, TooltipCard, usdTick } from "./shared";

export interface MonthDatum {
  /** YYYY-MM */
  month: string;
  value: number;
}

const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Net obligations per month. Single series, so no legend: the section title names it. */
export function AwardsOverTime({ data, label = "Net obligations" }: { data: MonthDatum[]; label?: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`${label} by month, column chart. Table view below.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tick={AXIS_TICK}
            stroke={AXIS_STROKE}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={usdTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
          <ReferenceLine y={0} stroke={AXIS_STROKE} />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={monthLabel(String(payload[0].payload.month))}
                  rows={[{ label, value: formatUsd(Number(payload[0].value)), swatch: "var(--series-1)" }]}
                />
              ) : null
            }
          />
          <Bar dataKey="value" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
