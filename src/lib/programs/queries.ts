import type { PlanKey } from "@/config/plans";
import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import { CONFIRMED_SQL, POSSIBLE_SQL } from "@/lib/mapping/sql";
import type { MonthPoint } from "@/lib/periods";

/**
 * Program, theme and grant-program page queries. Each scope is a slice of all awards, so these
 * read transactions directly (via the AwardProgram or assistance-listing index) with the
 * viewer's data window applied.
 */

const FAR_PAST = new Date(Date.UTC(1900, 0, 1));
const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

/**
 * What a page covers: a program or theme from src/config (by slug, via AwardProgram tags),
 * or an official assistance listing (by number, straight from Award). A bare string is a slug.
 */
export type AwardScope = string | { program: string } | { listing: string };

const scopeKey = (scope: AwardScope) => (typeof scope === "string" ? scope : "program" in scope ? scope.program : scope.listing);

/**
 * Shared FROM/WHERE: transactions of awards in scope $1 that are visible in the viewer's
 * window ($2 history start, $3 availability cutoff). `tm` is the recipient's match.
 */
const scopedTx = (scope: AwardScope, extraJoins = "", matchJoin = "LEFT JOIN") => {
  const listing = typeof scope !== "string" && "listing" in scope;
  return `
  FROM ${listing ? `"Award" a` : `"AwardProgram" ap JOIN "Award" a ON a.id = ap."awardId"`}
  JOIN "AwardTransaction" t ON t."awardId" = a.id
  ${matchJoin} "TickerMatch" tm ON tm."recipientId" = a."recipientId"
  ${extraJoins}
  WHERE ${listing ? `a."assistanceListing"` : `ap."programSlug"`} = $1 AND t."actionDate" >= $2::date AND t."availableAt" <= $3`;
};

const windowArgs = (scope: AwardScope, win: DataWindow) =>
  [scopeKey(scope), win.historyStart ?? FAR_PAST, win.availableBefore ?? FAR_FUTURE] as const;

export interface ProgramListItem {
  slug: string;
  name: string;
  description: string | null;
  total: string;
  publicCompanies: number;
}

/** Programs and themes with headline totals for the viewer's plan (from ProgramSummary). */
export async function listPrograms(plan: PlanKey): Promise<ProgramListItem[]> {
  const programs = await prisma.program.findMany({
    orderBy: { name: "asc" },
    include: { summaries: { where: { plan } } },
  });
  return programs.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    total: p.summaries[0]?.total.toString() ?? "0",
    publicCompanies: p.summaries[0]?.publicCompanies ?? 0,
  }));
}

export async function getProgram(slug: string) {
  return prisma.program.findUnique({ where: { slug } });
}

export interface ProgramSummary {
  total: number;
  publicTotal: number;
  awardCount: number;
  recipientCount: number;
  monthly: MonthPoint[];
}

export async function getProgramSummary(scope: AwardScope, win: DataWindow): Promise<ProgramSummary> {
  const [totals] = await prisma.$queryRawUnsafe<{ total: string; public_total: string; awards: number; recipients: number }[]>(
    `SELECT COALESCE(SUM(t.obligation), 0)::text AS total,
            COALESCE(SUM(t.obligation) FILTER (WHERE ${CONFIRMED_SQL}), 0)::text AS public_total,
            COUNT(DISTINCT a.id)::int AS awards, COUNT(DISTINCT a."recipientId")::int AS recipients ${scopedTx(scope)}`,
    ...windowArgs(scope, win),
  );
  const monthly = await prisma.$queryRawUnsafe<{ month: Date; obligated: string }[]>(
    `SELECT date_trunc('month', t."actionDate")::date AS month, SUM(t.obligation)::text AS obligated ${scopedTx(scope)}
     GROUP BY 1 ORDER BY 1`,
    ...windowArgs(scope, win),
  );
  return {
    total: Number(totals.total),
    publicTotal: Number(totals.public_total),
    awardCount: totals.awards,
    recipientCount: totals.recipients,
    monthly: monthly.map((m) => ({ month: m.month, obligated: Number(m.obligated) })),
  };
}

export interface ProgramCompany {
  cik: string;
  ticker: string;
  name: string;
  /** Net obligations: additions minus reductions in the window. */
  total: number;
  /** New awards and increases (positive transactions). */
  added: number;
  /** De-obligations (negative transactions), as a negative number or 0. */
  reduced: number;
  awards: number;
  latestAction: Date;
}

/** Public companies receiving program funds: confirmed links, and separately possible ones. */
export async function getProgramCompanies(
  scope: AwardScope,
  win: DataWindow,
): Promise<{ confirmed: ProgramCompany[]; possible: ProgramCompany[] }> {
  const query = (predicate: string) =>
    prisma.$queryRawUnsafe<(Omit<ProgramCompany, "total" | "added" | "reduced"> & { total: string; added: string; reduced: string })[]>(
      `SELECT c.cik, c.ticker, c.name, SUM(t.obligation)::text AS total,
              COALESCE(SUM(t.obligation) FILTER (WHERE t.obligation > 0), 0)::text AS added,
              COALESCE(SUM(t.obligation) FILTER (WHERE t.obligation < 0), 0)::text AS reduced,
              COUNT(DISTINCT a.id)::int AS awards,
              MAX(t."actionDate") AS "latestAction"
       ${scopedTx(scope, `JOIN "Company" c ON c.cik = tm."companyCik"`, "JOIN")} AND ${predicate}
       GROUP BY c.cik, c.ticker, c.name ORDER BY SUM(t.obligation) DESC LIMIT 100`,
      ...windowArgs(scope, win),
    );
  const [confirmed, possible] = await Promise.all([query(CONFIRMED_SQL), query(POSSIBLE_SQL)]);
  const toNum = (rows: Awaited<ReturnType<typeof query>>) =>
    rows.map((r) => ({ ...r, total: Number(r.total), added: Number(r.added), reduced: Number(r.reduced) }));
  return { confirmed: toNum(confirmed), possible: toNum(possible) };
}

export interface ProgramAward {
  transactionId: string;
  actionDate: Date;
  obligation: string;
  description: string | null;
  recipientId: string | null;
  recipientName: string | null;
  ticker: string | null;
  matchStatus: string | null;
  matchConfidence: number | null;
  matchCik: string | null;
  sourceUrl: string;
}

export async function getProgramLargestAwards(scope: AwardScope, win: DataWindow, limit = 15): Promise<ProgramAward[]> {
  return prisma.$queryRawUnsafe<ProgramAward[]>(
    `SELECT t.id AS "transactionId", t."actionDate", t.obligation::text AS obligation,
            COALESCE(t.description, a.description) AS description, r.id AS "recipientId", r.name AS "recipientName",
            c.ticker, tm.status::text AS "matchStatus", tm.confidence AS "matchConfidence", tm."companyCik" AS "matchCik",
            a."sourceUrl"
     ${scopedTx(scope, `LEFT JOIN "Company" c ON c.cik = tm."companyCik" LEFT JOIN "Recipient" r ON r.id = a."recipientId"`)}
     ORDER BY t.obligation DESC LIMIT $4`,
    ...windowArgs(scope, win),
    limit,
  );
}
