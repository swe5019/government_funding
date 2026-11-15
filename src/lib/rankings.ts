import { plans } from "@/config/plans";
import { prisma } from "@/lib/db";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import { parseScreenerFilters } from "@/lib/screener/filters";
import { runScreener, type ScreenerRow } from "@/lib/screener/query";

/**
 * Public (free-tier view) rankings and per-company headline numbers for search pages and
 * metadata. Always the free plan's window so public pages and search snippets agree.
 */
const publicWindow = () => dataWindow(plans.free.entitlements);

/** Public companies by federal awards over the last 12 months, largest first. */
export async function getTopContractors(limit: number): Promise<ScreenerRow[]> {
  const rows = await runScreener(parseScreenerFilters({}), publicWindow(), new Date(), limit);
  return rows.filter((r) => r.last12 > 0);
}

export interface CompanySnippet {
  name: string;
  last12: number;
  topAgency: string | null;
}

/** Name, last-12-month total and top agency for a ticker's title and description, or null. */
export async function getCompanySnippet(ticker: string): Promise<CompanySnippet | null> {
  const t = ticker.trim().toUpperCase();
  const company = await prisma.company.findFirst({
    where: { OR: [{ ticker: t }, { tickers: { has: t } }], NOT: { ticker: { startsWith: "X:" } } },
    select: { cik: true, name: true },
  });
  if (!company) return null;
  const win = publicWindow();
  const now = new Date();
  const since12 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [totals, agency] = await Promise.all([
    prisma.companyAwardMonthly.aggregate({
      where: { companyCik: company.cik, view: win.view, agencyCode: "ALL", category: "ALL", includesPossible: false, month: { gte: since12 } },
      _sum: { obligated: true },
    }),
    prisma.$queryRaw<{ name: string | null }[]>`
      SELECT ag.name FROM "CompanyAwardMonthly" x LEFT JOIN "Agency" ag ON ag.code = x."agencyCode"
      WHERE x."companyCik" = ${company.cik} AND x.view = ${win.view}::"DataView" AND x."agencyCode" <> 'ALL'
        AND x.category = 'ALL' AND NOT x."includesPossible" AND x.month >= ${since12}::date
      GROUP BY ag.name ORDER BY SUM(x.obligated) DESC LIMIT 1`,
  ]);
  return { name: company.name, last12: Number(totals._sum.obligated ?? 0), topAgency: agency[0]?.name ?? null };
}

/** Tickers with a confirmed recipient link and some award activity: the company pages worth indexing. */
export async function getIndexableTickers(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ ticker: string }[]>(
    `SELECT DISTINCT c.ticker FROM "TickerMatch" tm JOIN "Company" c ON c.cik = tm."companyCik"
     WHERE ${CONFIRMED_SQL} AND c.ticker NOT LIKE 'X:%'
       AND EXISTS (SELECT 1 FROM "CompanyAwardMonthly" m WHERE m."companyCik" = c.cik AND m."agencyCode" = 'ALL'
                   AND m.category = 'ALL' AND m.obligated <> 0)
     ORDER BY 1 LIMIT $1`,
    limit,
  );
  return rows.map((r) => r.ticker);
}
