import { Prisma } from "@/generated/prisma/client";
import { featureConfig } from "@/config/features";
import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import type { ScreenerFilters, ScreenerSort } from "./filters";

export interface ScreenerRow {
  cik: string;
  ticker: string;
  name: string;
  sector: string | null;
  marketCap: number | null;
  last12: number;
  prior12: number;
  /** Fraction (0.25 = +25%); null when the prior period had no positive total. */
  growth: number | null;
  /** Last-12-month awards / market cap; null without market cap. */
  toMarketCap: number | null;
  topAgency: string | null;
}

/** Qualified with the subquery alias so ORDER BY uses the numeric columns, not the text-cast outputs. */
const ORDER: Record<ScreenerSort, Prisma.Sql> = {
  last12: Prisma.sql`s.last12`,
  prior12: Prisma.sql`s.prior12`,
  growth: Prisma.sql`s.growth`,
  toMarketCap: Prisma.sql`s.to_market_cap`,
  ticker: Prisma.sql`s.ticker`,
};

/**
 * Companies by federal award activity (confirmed links only), last 12 months vs the 12 before,
 * from CompanyAwardMonthly. All filters are parameterized; sort keys come from a whitelist.
 */
export async function runScreener(f: ScreenerFilters, win: DataWindow, now = new Date(), limit: number = featureConfig.screener.pageSize): Promise<ScreenerRow[]> {
  const since12 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const since24 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1));
  const where: Prisma.Sql[] = [Prisma.sql`c.ticker NOT LIKE 'X:%'`];
  if (f.minLast12 !== undefined) where.push(Prisma.sql`a.last12 >= ${f.minLast12}`);
  if (f.minGrowth !== undefined) where.push(Prisma.sql`a.prior12 > 0 AND (a.last12 - a.prior12) / a.prior12 >= ${f.minGrowth / 100}`);
  if (f.minToMarketCap !== undefined) where.push(Prisma.sql`c."marketCap" > 0 AND a.last12 / c."marketCap" >= ${f.minToMarketCap / 100}`);
  if (f.sector) where.push(Prisma.sql`c.sector = ${f.sector}`);
  if (f.agency) {
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "CompanyAwardMonthly" x WHERE x."companyCik" = c.cik AND x.view = ${win.view}::"DataView"
      AND x."agencyCode" = ${f.agency} AND x.category = 'ALL' AND NOT x."includesPossible" AND x.month >= ${since12}::date AND x.obligated > 0)`);
  }
  const dir = f.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const rows = await prisma.$queryRaw<
    (Omit<ScreenerRow, "marketCap" | "last12" | "prior12" | "growth" | "toMarketCap"> & {
      market_cap: string | null;
      last12: string;
      prior12: string;
      growth: string | null;
      to_market_cap: string | null;
    })[]
  >`
    WITH a AS (
      SELECT "companyCik" AS cik,
             COALESCE(SUM(obligated) FILTER (WHERE month >= ${since12}::date), 0) AS last12,
             COALESCE(SUM(obligated) FILTER (WHERE month < ${since12}::date), 0) AS prior12
      FROM "CompanyAwardMonthly"
      WHERE view = ${win.view}::"DataView" AND "agencyCode" = 'ALL' AND category = 'ALL' AND NOT "includesPossible"
        AND month >= ${since24}::date
      GROUP BY 1
    )
    SELECT cik, ticker, name, sector, "topAgency", market_cap::text AS market_cap, last12::text AS last12,
           prior12::text AS prior12, growth::text AS growth, to_market_cap::text AS to_market_cap
    FROM (
      SELECT c.cik, c.ticker, c.name, c.sector, c."marketCap" AS market_cap, a.last12, a.prior12,
             CASE WHEN a.prior12 > 0 THEN (a.last12 - a.prior12) / a.prior12 END AS growth,
             CASE WHEN c."marketCap" > 0 THEN a.last12 / c."marketCap" END AS to_market_cap,
             (SELECT ag.name FROM "CompanyAwardMonthly" x LEFT JOIN "Agency" ag ON ag.code = x."agencyCode"
              WHERE x."companyCik" = c.cik AND x.view = ${win.view}::"DataView" AND x."agencyCode" <> 'ALL'
                AND x.category = 'ALL' AND NOT x."includesPossible" AND x.month >= ${since12}::date
              GROUP BY ag.name ORDER BY SUM(x.obligated) DESC LIMIT 1) AS "topAgency"
      FROM a JOIN "Company" c ON c.cik = a.cik
      WHERE ${Prisma.join(where, " AND ")}
    ) s
    -- Sort on the numeric columns; text casts happen only in the outer SELECT.
    ORDER BY ${ORDER[f.sort]} ${dir} NULLS LAST, s.ticker ASC
    LIMIT ${limit}`;

  return rows.map((r) => ({
    cik: r.cik,
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    topAgency: r.topAgency,
    marketCap: r.market_cap === null ? null : Number(r.market_cap),
    last12: Number(r.last12),
    prior12: Number(r.prior12),
    growth: r.growth === null ? null : Number(r.growth),
    toMarketCap: r.to_market_cap === null ? null : Number(r.to_market_cap),
  }));
}

export async function screenerOptions() {
  const [sectors, agencies] = await Promise.all([
    prisma.$queryRaw<{ sector: string }[]>`SELECT DISTINCT sector FROM "Company" WHERE sector IS NOT NULL ORDER BY 1`,
    prisma.$queryRaw<{ code: string; name: string }[]>`
      SELECT DISTINCT ag.code, ag.name FROM "CompanyAwardMonthly" m JOIN "Agency" ag ON ag.code = m."agencyCode" ORDER BY ag.name`,
  ]);
  return { sectors: sectors.map((s) => s.sector), agencies };
}

/** Market cap needs a price provider (shares x price); until then the column/filter are unavailable. */
export async function hasMarketCaps(): Promise<boolean> {
  return (await prisma.company.count({ where: { marketCap: { gt: 0 } } })) > 0;
}
