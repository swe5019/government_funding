import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import { matchDisplay, type MatchDisplay } from "@/lib/mapping/display";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import type { MonthPoint } from "@/lib/periods";

/**
 * Company page queries. Totals come from CompanyAwardMonthly (confirmed links only unless
 * noted); award-level rows come from transactions filtered by the viewer's data window.
 */

/** Award events of at least this size are marked on the price chart. */
export const AWARD_EVENT_MIN_USD = 10_000_000;

const FAR_PAST = new Date(Date.UTC(1900, 0, 1));
const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");
const start = (win: DataWindow) => win.historyStart ?? FAR_PAST;
const availableBefore = (win: DataWindow) => win.availableBefore ?? FAR_FUTURE;

export async function getCompanyByTicker(ticker: string) {
  const t = ticker.trim().toUpperCase();
  if (!t || t.startsWith("X:")) return null;
  return prisma.company.findFirst({
    where: { OR: [{ ticker: t }, { tickers: { has: t } }], NOT: { ticker: { startsWith: "X:" } } },
  });
}

export async function getCompanyMonthly(cik: string, win: DataWindow, includesPossible = false): Promise<MonthPoint[]> {
  const rows = await prisma.companyAwardMonthly.findMany({
    where: { companyCik: cik, view: win.view, agencyCode: "ALL", category: "ALL", includesPossible, month: { gte: start(win) } },
    orderBy: { month: "asc" },
    select: { month: true, obligated: true },
  });
  return rows.map((r) => ({ month: r.month, obligated: Number(r.obligated) }));
}

export interface Breakdown {
  key: string;
  label: string;
  obligated: number;
}

export async function getTopAgencies(cik: string, win: DataWindow, limit = 8): Promise<Breakdown[]> {
  return (
    await prisma.$queryRaw<{ key: string; label: string | null; obligated: string }[]>`
      SELECT m."agencyCode" AS key, a.name AS label, SUM(m.obligated)::text AS obligated
      FROM "CompanyAwardMonthly" m LEFT JOIN "Agency" a ON a.code = m."agencyCode"
      WHERE m."companyCik" = ${cik} AND m.view = ${win.view}::"DataView" AND m.month >= ${start(win)}::date
        AND m."agencyCode" <> 'ALL' AND m.category = 'ALL' AND NOT m."includesPossible"
      GROUP BY 1, 2 HAVING SUM(m.obligated) > 0
      ORDER BY SUM(m.obligated) DESC LIMIT ${limit}`
  ).map((r) => ({ key: r.key, label: r.label ?? (r.key === "UNKNOWN" ? "Unknown agency" : r.key), obligated: Number(r.obligated) }));
}

const CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: "Contracts",
  IDV: "Indefinite-delivery vehicles",
  GRANT: "Grants",
  LOAN: "Loans",
  DIRECT_PAYMENT: "Direct payments",
  INSURANCE: "Insurance",
  OTHER: "Other assistance",
};

export async function getCategoryMix(cik: string, win: DataWindow): Promise<Breakdown[]> {
  return (
    await prisma.$queryRaw<{ key: string; obligated: string }[]>`
      SELECT category AS key, SUM(obligated)::text AS obligated FROM "CompanyAwardMonthly"
      WHERE "companyCik" = ${cik} AND view = ${win.view}::"DataView" AND month >= ${start(win)}::date
        AND "agencyCode" = 'ALL' AND category <> 'ALL' AND NOT "includesPossible"
      GROUP BY 1 ORDER BY SUM(obligated) DESC`
  ).map((r) => ({ key: r.key, label: CATEGORY_LABELS[r.key] ?? r.key, obligated: Number(r.obligated) }));
}

export interface CompanyAward {
  transactionId: string;
  awardId: string;
  displayId: string | null;
  actionDate: Date;
  obligation: string;
  description: string | null;
  category: string;
  agencyName: string | null;
  subAgencyName: string | null;
  recipientId: string;
  recipientName: string;
  sourceUrl: string;
}

/** Largest obligations from confirmed recipients since `since` (default: last 12 months). */
export async function getCompanyLargestAwards(cik: string, win: DataWindow, limit = 15, since?: Date): Promise<CompanyAward[]> {
  const from = since ?? new Date(Date.now() - 365 * 86_400_000);
  const effectiveFrom = win.historyStart && win.historyStart > from ? win.historyStart : from;
  return prisma.$queryRawUnsafe<CompanyAward[]>(
    `SELECT t.id AS "transactionId", a.id AS "awardId", a."displayId", t."actionDate", t.obligation::text AS obligation,
            COALESCE(t.description, a.description) AS description, a.category::text AS category,
            ag.name AS "agencyName", sa.name AS "subAgencyName", r.id AS "recipientId", r.name AS "recipientName", a."sourceUrl"
     FROM "TickerMatch" tm
     JOIN "Recipient" r ON r.id = tm."recipientId"
     JOIN "Award" a ON a."recipientId" = tm."recipientId"
     JOIN "AwardTransaction" t ON t."awardId" = a.id
     LEFT JOIN "Agency" ag ON ag.code = a."awardingAgencyCode"
     LEFT JOIN "SubAgency" sa ON sa.code = a."awardingSubCode"
     WHERE tm."companyCik" = $1 AND ${CONFIRMED_SQL}
       AND t."actionDate" >= $2::date AND t."availableAt" <= $3
     ORDER BY t.obligation DESC LIMIT $4`,
    cik,
    effectiveFrom,
    availableBefore(win),
    limit,
  );
}

export interface AwardEvent {
  date: string;
  obligation: number;
  label: string;
  recipientName: string;
  sourceUrl: string;
}

/** Large awards to mark on the price chart (>= AWARD_EVENT_MIN_USD, at most `limit`, newest window). */
export async function getAwardEvents(cik: string, win: DataWindow, since: Date, limit = 20): Promise<AwardEvent[]> {
  const rows = await prisma.$queryRawUnsafe<{ date: Date; obligation: string; label: string | null; recipientName: string; sourceUrl: string }[]>(
    `SELECT t."actionDate" AS date, t.obligation::text AS obligation, COALESCE(a.description, t.description) AS label,
            r.name AS "recipientName", a."sourceUrl"
     FROM "TickerMatch" tm
     JOIN "Recipient" r ON r.id = tm."recipientId"
     JOIN "Award" a ON a."recipientId" = tm."recipientId"
     JOIN "AwardTransaction" t ON t."awardId" = a.id
     WHERE tm."companyCik" = $1 AND ${CONFIRMED_SQL}
       AND t."actionDate" >= $2::date AND t."availableAt" <= $3 AND t.obligation >= $4
     ORDER BY t.obligation DESC LIMIT $5`,
    cik,
    since,
    availableBefore(win),
    AWARD_EVENT_MIN_USD,
    limit,
  );
  return rows
    .map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      obligation: Number(r.obligation),
      label: r.label ?? "Award",
      recipientName: r.recipientName,
      sourceUrl: r.sourceUrl,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface LinkedRecipient {
  recipientId: string;
  name: string;
  uei: string | null;
  method: string;
  status: string;
  confidence: number;
  display: MatchDisplay;
  total: number;
}

/** Legal entities linked to the company (confirmed and possible), with their totals in the window. */
export async function getCompanyRecipients(cik: string, win: DataWindow): Promise<LinkedRecipient[]> {
  const rows = await prisma.$queryRaw<(Omit<LinkedRecipient, "display" | "total"> & { total: string; companyCik: string })[]>`
    SELECT tm."recipientId", r.name, r.uei, tm.method::text AS method, tm.status::text AS status, tm.confidence,
           tm."companyCik", COALESCE(SUM(m.obligated), 0)::text AS total
    FROM "TickerMatch" tm
    JOIN "Recipient" r ON r.id = tm."recipientId"
    LEFT JOIN "RecipientAwardMonthly" m ON m."recipientId" = tm."recipientId" AND m.view = ${win.view}::"DataView"
      AND m.month >= ${start(win)}::date
    WHERE tm."companyCik" = ${cik} AND tm.status <> 'REJECTED'
    GROUP BY tm."recipientId", r.name, r.uei, tm.method, tm.status, tm.confidence, tm."companyCik"
    ORDER BY SUM(m.obligated) DESC NULLS LAST
    LIMIT 50`;
  return rows.map((r) => ({ ...r, total: Number(r.total), display: matchDisplay(r) }));
}

export interface PricePoint {
  date: string;
  close: number;
}

export async function getPriceSeries(cik: string, provider: string, since: Date): Promise<PricePoint[]> {
  const rows = await prisma.priceBar.findMany({
    where: { companyCik: cik, provider, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), close: Number(r.close) }));
}

export interface ExportAwardRow {
  actionDate: Date;
  availableAt: Date;
  obligation: string;
  awardId: string;
  displayId: string | null;
  modNumber: string | null;
  category: string;
  description: string | null;
  recipientName: string;
  recipientUei: string | null;
  linkMethod: string;
  agencyName: string | null;
  subAgencyName: string | null;
  sourceUrl: string;
}

/** Every transaction from confirmed recipients in the viewer's window (CSV export). */
export async function getCompanyAwardsForExport(cik: string, win: DataWindow, limit: number): Promise<ExportAwardRow[]> {
  return prisma.$queryRawUnsafe<ExportAwardRow[]>(
    `SELECT t."actionDate", t."availableAt", t.obligation::text AS obligation, a.id AS "awardId", a."displayId",
            t."modNumber", a.category::text AS category, COALESCE(t.description, a.description) AS description,
            r.name AS "recipientName", r.uei AS "recipientUei", tm.method::text AS "linkMethod",
            ag.name AS "agencyName", sa.name AS "subAgencyName", a."sourceUrl"
     FROM "TickerMatch" tm
     JOIN "Recipient" r ON r.id = tm."recipientId"
     JOIN "Award" a ON a."recipientId" = tm."recipientId"
     JOIN "AwardTransaction" t ON t."awardId" = a.id
     LEFT JOIN "Agency" ag ON ag.code = a."awardingAgencyCode"
     LEFT JOIN "SubAgency" sa ON sa.code = a."awardingSubCode"
     WHERE tm."companyCik" = $1 AND ${CONFIRMED_SQL}
       AND t."actionDate" >= $2::date AND t."availableAt" <= $3
     ORDER BY t."actionDate" DESC, t.id
     LIMIT $4`,
    cik,
    start(win),
    availableBefore(win),
    limit,
  );
}
