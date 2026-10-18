/** Period-over-period math on monthly totals (months are first-of-month UTC dates). */

export interface MonthPoint {
  month: Date;
  obligated: number;
}

export interface PeriodSummary {
  last12: number;
  prior12: number;
  /** Fractional change; null when the prior period had no positive total to compare with. */
  last12Change: number | null;
  /** Current calendar quarter to date (whole months so far). */
  quarter: number;
  /** Same months one year earlier. */
  quarterPriorYear: number;
  quarterChange: number | null;
  /** e.g. "Q4 2026" */
  quarterLabel: string;
}

const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

export function pctChange(current: number, prior: number): number | null {
  return prior > 0 ? (current - prior) / prior : null;
}

export function summarizePeriods(series: MonthPoint[], now: Date = new Date()): PeriodSummary {
  const nowIdx = monthIndex(now);
  const qStartIdx = nowIdx - (now.getUTCMonth() % 3);
  const sum = (from: number, to: number) =>
    series.reduce((s, p) => {
      const i = monthIndex(p.month);
      return i >= from && i <= to ? s + p.obligated : s;
    }, 0);

  const last12 = sum(nowIdx - 11, nowIdx);
  const prior12 = sum(nowIdx - 23, nowIdx - 12);
  const quarter = sum(qStartIdx, nowIdx);
  const quarterPriorYear = sum(qStartIdx - 12, nowIdx - 12);
  return {
    last12,
    prior12,
    last12Change: pctChange(last12, prior12),
    quarter,
    quarterPriorYear,
    quarterChange: pctChange(quarter, quarterPriorYear),
    quarterLabel: `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`,
  };
}

/** Fill gaps so a chart shows empty months as zero instead of skipping them. */
export function fillMonths(series: MonthPoint[], from: Date, to: Date): MonthPoint[] {
  const byIdx = new Map(series.map((p) => [monthIndex(p.month), p.obligated]));
  const out: MonthPoint[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to); i++) {
    out.push({ month: new Date(Date.UTC(Math.floor(i / 12), i % 12, 1)), obligated: byIdx.get(i) ?? 0 });
  }
  return out;
}
