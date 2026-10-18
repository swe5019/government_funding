"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { formatUsd, formatUsdCompact } from "@/lib/format";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, TooltipCard } from "./shared";

export interface PriceDatum {
  date: string;
  close: number;
}

export interface AwardMarker {
  date: string;
  obligation: number;
  label: string;
  recipientName: string;
}

interface Row {
  date: string;
  close: number;
  /** Set on days with an award marker: the marker sits on the price line. */
  award?: number;
  awards?: AwardMarker[];
}

const dateLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Snap each award to the first trading day on/after its action date. */
function merge(prices: PriceDatum[], awards: AwardMarker[]): Row[] {
  const rows: Row[] = prices.map((p) => ({ ...p }));
  for (const a of awards) {
    const i = rows.findIndex((r) => r.date >= a.date);
    if (i < 0) continue;
    rows[i].award = rows[i].close;
    (rows[i].awards ??= []).push(a);
  }
  return rows;
}

/**
 * Closing price with large awards marked on the line. One y-axis (price): award size is in
 * the tooltip, never a second scale.
 */
export function PriceWithAwards({ prices, awards, ticker }: { prices: PriceDatum[]; awards: AwardMarker[]; ticker: string }) {
  const data = merge(prices, awards);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} />
          {ticker} closing price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-2)" }} />
          Award ≥ $10M (hover for details)
        </span>
      </div>
      <div className="h-72 w-full" role="img" aria-label={`${ticker} closing price with large federal awards marked. Award list below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              stroke={AXIS_STROKE}
              tickLine={false}
              minTickGap={48}
              tickFormatter={(d: string) =>
                new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
              }
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            {/* Marker area 120px² -> ~12px diameter, above the 8px minimum. */}
            <ZAxis range={[120, 120]} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <TooltipCard
                    title={dateLabel(row.date)}
                    rows={[
                      { label: "Close", value: formatUsd(row.close).replace(/\.00$/, ""), swatch: "var(--series-1)" },
                      ...(row.awards ?? []).map((a) => ({
                        label: `${a.recipientName}: ${a.label.slice(0, 40)}`,
                        value: formatUsdCompact(a.obligation),
                        swatch: "var(--series-2)",
                      })),
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Scatter
              dataKey="award"
              fill="var(--series-2)"
              stroke="var(--surface)"
              strokeWidth={2}
              shape="circle"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
