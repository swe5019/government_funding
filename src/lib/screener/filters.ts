import { z } from "zod";

/** Screener filters from the query string. Invalid values fall back to "no filter". */
export const SORTS = ["last12", "growth", "prior12", "toMarketCap", "ticker"] as const;
export type ScreenerSort = (typeof SORTS)[number];

const num = z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().finite().optional());

const schema = z.object({
  minLast12: num.pipe(z.number().min(0).optional()),
  /** Minimum growth, percent (e.g. 25 = +25% vs prior 12 months). */
  minGrowth: num,
  /** Minimum last-12-month awards as a percent of market cap. */
  minToMarketCap: num.pipe(z.number().min(0).optional()),
  agency: z.string().regex(/^[0-9A-Z]{2,4}$/).optional(),
  sector: z.string().max(80).optional(),
  sort: z.enum(SORTS).catch("last12"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
});

export type ScreenerFilters = z.infer<typeof schema>;

export function parseScreenerFilters(sp: Record<string, string | string[] | undefined>): ScreenerFilters {
  const flat: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v === "" ? undefined : v]),
  );
  // Validate field by field so one bad value only drops that filter.
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape) as (keyof typeof schema.shape)[]) {
    const r = schema.shape[key].safeParse(flat[key]);
    if (r.success && r.data !== undefined) out[key] = r.data;
  }
  return schema.parse(out);
}

/** Back to a query string (for sort links and the CSV export URL). */
export function filtersToQuery(f: Partial<ScreenerFilters>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
}
