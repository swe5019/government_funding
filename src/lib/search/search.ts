import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import { normalizeName } from "@/lib/mapping/normalize";

export interface RecipientHit {
  id: string;
  name: string;
  uei: string | null;
  recipientType: string;
  stateCode: string | null;
  countryCode: string | null;
  parentName: string | null;
  last12m: string;
  total: string;
  ticker: string | null;
  matchStatus: string | null;
  matchConfidence: number | null;
  matchCik: string | null;
}

export interface AgencyHit {
  code: string;
  name: string;
  abbreviation: string | null;
}

export interface CompanyHit {
  cik: string;
  ticker: string;
  tickers: string[];
  name: string;
  exchange: string | null;
  /** Confirmed-match obligations within the viewer's data window. */
  total: string;
}

export interface SearchResults {
  query: string;
  recipients: RecipientHit[];
  agencies: AgencyHit[];
  companies: CompanyHit[];
}

const CANDIDATES = 200;
const LIMIT = 25;

/**
 * Search recipients, agencies and companies. Recipients are found by trigram similarity or
 * substring on the normalized name (both use the GIN trigram index), then ranked: exact name,
 * prefix match, then dollars received within the viewer's data window.
 */
export async function search(rawQuery: string, win: DataWindow, now: Date = new Date()): Promise<SearchResults> {
  const query = rawQuery.trim().slice(0, 200);
  const q = normalizeName(query);
  if (!q) return { query, recipients: [], agencies: [], companies: [] };

  const since12m = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const historyStart = win.historyStart ?? new Date(Date.UTC(1900, 0, 1));
  const like = `%${q}%`;

  const [recipients, agencies, companies] = await Promise.all([
    prisma.$queryRaw<RecipientHit[]>`
      WITH candidates AS (
        SELECT id, similarity("normalizedName", ${q}) AS sim
        FROM "Recipient"
        WHERE "normalizedName" % ${q} OR "normalizedName" LIKE ${like}
        ORDER BY sim DESC
        LIMIT ${CANDIDATES}
      )
      SELECT r.id, r.name, r.uei, r."recipientType", r."stateCode", r."countryCode", r."parentName",
             COALESCE(SUM(m.obligated) FILTER (WHERE m.month >= ${since12m}::date), 0)::text AS "last12m",
             COALESCE(SUM(m.obligated), 0)::text AS total,
             MAX(c.sim) AS sim,
             co.ticker, tm.status::text AS "matchStatus", tm.confidence AS "matchConfidence", tm."companyCik" AS "matchCik"
      FROM candidates c
      JOIN "Recipient" r ON r.id = c.id
      LEFT JOIN "RecipientAwardMonthly" m
        ON m."recipientId" = r.id AND m.view = ${win.view}::"DataView" AND m.month >= ${historyStart}::date
      LEFT JOIN "TickerMatch" tm ON tm."recipientId" = r.id
      LEFT JOIN "Company" co ON co.cik = tm."companyCik"
      GROUP BY r.id, co.ticker, tm.status, tm.confidence, tm."companyCik"
      ORDER BY (r."normalizedName" = ${q}) DESC,
               (r."normalizedName" LIKE ${q + "%"}) DESC,
               SUM(m.obligated) DESC NULLS LAST,
               MAX(c.sim) DESC
      LIMIT ${LIMIT}`,
    prisma.$queryRaw<AgencyHit[]>`
      SELECT code, name, abbreviation FROM "Agency"
      WHERE name ILIKE ${"%" + query + "%"} OR abbreviation ILIKE ${query} OR name % ${query}
      ORDER BY similarity(name, ${query}) DESC
      LIMIT 10`,
    prisma.$queryRaw<CompanyHit[]>`
      SELECT c.cik, c.ticker, c.tickers, c.name, c.exchange,
             COALESCE((SELECT SUM(m.obligated) FROM "CompanyAwardMonthly" m
                       WHERE m."companyCik" = c.cik AND m.view = ${win.view}::"DataView" AND m.month >= ${historyStart}::date
                         AND m."agencyCode" = 'ALL' AND m.category = 'ALL' AND NOT m."includesPossible"), 0)::text AS total
      FROM "Company" c
      WHERE c.ticker NOT LIKE 'X:%'
        AND (${query.toUpperCase()} = ANY(c.tickers) OR c."normalizedName" % ${q} OR c."normalizedName" LIKE ${like})
      ORDER BY (${query.toUpperCase()} = ANY(c.tickers)) DESC, c."isMajorExchange" DESC, similarity(c."normalizedName", ${q}) DESC
      LIMIT 10`,
  ]);

  return { query, recipients, agencies, companies };
}
