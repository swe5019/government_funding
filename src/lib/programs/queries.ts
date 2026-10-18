import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import { CONFIRMED_SQL, POSSIBLE_SQL } from "@/lib/mapping/sql";
import type { MonthPoint } from "@/lib/periods";

/**
 * Program page queries. Programs are a small slice of all awards, so these read
 * transactions directly (via the AwardProgram index) with the viewer's data window applied.
 */

const FAR_PAST = new Date(Date.UTC(1900, 0, 1));
const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

/**
 * Shared FROM/WHERE: transactions of awards tagged to program $1 that are visible in the
 * viewer's window ($2 history start, $3 availability cutoff). `tm` is the recipient's match.
 */
const programTx = (extraJoins = "", matchJoin = "LEFT JOIN") => `
  FROM "AwardProgram" ap
  JOIN "Award" a ON a.id = ap."awardId"
  JOIN "AwardTransaction" t ON t."awardId" = a.id
  ${matchJoin} "TickerMatch" tm ON tm."recipientId" = a."recipientId"
  ${extraJoins}
  WHERE ap."programSlug" = $1 AND t."actionDate" >= $2::date AND t."availableAt" <= $3`;
const PROGRAM_TX = programTx();

const windowArgs = (slug: string, win: DataWindow) =>
  [slug, win.historyStart ?? FAR_PAST, win.availableBefore ?? FAR_FUTURE] as const;

export interface ProgramListItem {
  slug: string;
  name: string;
  description: string | null;
  total: string;
  publicCompanies: number;
}

export async function listPrograms(win: DataWindow): Promise<ProgramListItem[]> {
  const programs = await prisma.program.findMany({ orderBy: { name: "asc" } });
  return Promise.all(
    programs.map(async (p) => {
      const [s] = await prisma.$queryRawUnsafe<{ total: string; companies: number }[]>(
        `SELECT COALESCE(SUM(t.obligation), 0)::text AS total,
                COUNT(DISTINCT tm."companyCik") FILTER (WHERE ${CONFIRMED_SQL})::int AS companies ${PROGRAM_TX}`,
        ...windowArgs(p.slug, win),
      );
      return { slug: p.slug, name: p.name, description: p.description, total: s.total, publicCompanies: s.companies };
    }),
  );
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

export async function getProgramSummary(slug: string, win: DataWindow): Promise<ProgramSummary> {
  const [totals] = await prisma.$queryRawUnsafe<{ total: string; public_total: string; awards: number; recipients: number }[]>(
    `SELECT COALESCE(SUM(t.obligation), 0)::text AS total,
            COALESCE(SUM(t.obligation) FILTER (WHERE ${CONFIRMED_SQL}), 0)::text AS public_total,
            COUNT(DISTINCT a.id)::int AS awards, COUNT(DISTINCT a."recipientId")::int AS recipients ${PROGRAM_TX}`,
    ...windowArgs(slug, win),
  );
  const monthly = await prisma.$queryRawUnsafe<{ month: Date; obligated: string }[]>(
    `SELECT date_trunc('month', t."actionDate")::date AS month, SUM(t.obligation)::text AS obligated ${PROGRAM_TX}
     GROUP BY 1 ORDER BY 1`,
    ...windowArgs(slug, win),
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
  total: number;
  awards: number;
  latestAction: Date;
}

/** Public companies receiving program funds: confirmed links, and separately possible ones. */
export async function getProgramCompanies(slug: string, win: DataWindow): Promise<{ confirmed: ProgramCompany[]; possible: ProgramCompany[] }> {
  const query = (predicate: string) =>
    prisma.$queryRawUnsafe<(Omit<ProgramCompany, "total"> & { total: string })[]>(
      `SELECT c.cik, c.ticker, c.name, SUM(t.obligation)::text AS total, COUNT(DISTINCT a.id)::int AS awards,
              MAX(t."actionDate") AS "latestAction"
       ${programTx(`JOIN "Company" c ON c.cik = tm."companyCik"`, "JOIN")} AND ${predicate}
       GROUP BY c.cik, c.ticker, c.name ORDER BY SUM(t.obligation) DESC LIMIT 100`,
      ...windowArgs(slug, win),
    );
  const [confirmed, possible] = await Promise.all([query(CONFIRMED_SQL), query(POSSIBLE_SQL)]);
  const toNum = (rows: Awaited<ReturnType<typeof query>>) => rows.map((r) => ({ ...r, total: Number(r.total) }));
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

export async function getProgramLargestAwards(slug: string, win: DataWindow, limit = 15): Promise<ProgramAward[]> {
  return prisma.$queryRawUnsafe<ProgramAward[]>(
    `SELECT t.id AS "transactionId", t."actionDate", t.obligation::text AS obligation,
            COALESCE(t.description, a.description) AS description, r.id AS "recipientId", r.name AS "recipientName",
            c.ticker, tm.status::text AS "matchStatus", tm.confidence AS "matchConfidence", tm."companyCik" AS "matchCik",
            a."sourceUrl"
     ${programTx(`LEFT JOIN "Company" c ON c.cik = tm."companyCik" LEFT JOIN "Recipient" r ON r.id = a."recipientId"`)}
     ORDER BY t.obligation DESC LIMIT $4`,
    ...windowArgs(slug, win),
    limit,
  );
}
