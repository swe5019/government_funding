"use client";

import { formatUsdCompact } from "@/lib/format";

/** Shared chart chrome: recessive hairline grid/axes, text in ink tokens (never series color). */
export const AXIS_TICK = { fill: "var(--chart-ink-muted)", fontSize: 12 };
export const GRID_STROKE = "var(--chart-grid)";
export const AXIS_STROKE = "var(--chart-axis)";

export const usdTick = (v: number) => (v === 0 ? "$0" : formatUsdCompact(v));

export function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; swatch?: string }[] }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted">
          {r.swatch && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.swatch }} aria-hidden />}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-3 font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
