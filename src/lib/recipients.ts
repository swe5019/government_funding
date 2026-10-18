import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";

export interface MonthlyTotal {
  month: Date;
  obligated: string;
  txCount: number;
}

export interface RecentAward {
  transactionId: string;
  awardId: string;
  displayId: string | null;
  actionDate: Date;
  obligation: string;
  description: string | null;
  category: string;
  agencyName: string | null;
  subAgencyName: string | null;
  sourceUrl: string;
}

export async function getRecipient(id: string) {
  return prisma.recipient.findUnique({ where: { id } });
}

export async function getRecipientMonthly(id: string, win: DataWindow): Promise<MonthlyTotal[]> {
  const rows = await prisma.recipientAwardMonthly.findMany({
    where: { recipientId: id, view: win.view, ...(win.historyStart ? { month: { gte: win.historyStart } } : {}) },
    orderBy: { month: "asc" },
  });
  return rows.map((r) => ({ month: r.month, obligated: r.obligated.toString(), txCount: r.txCount }));
}

/** Largest obligations in the last `days` days the viewer can see, each with its source link. */
export async function getLargestRecentAwards(id: string, win: DataWindow, days = 365, limit = 20): Promise<RecentAward[]> {
  const availableBefore = win.availableBefore ?? new Date("9999-12-31");
  const since = new Date(Date.now() - days * 86_400_000);
  const from = win.historyStart && win.historyStart > since ? win.historyStart : since;
  return prisma.$queryRaw<RecentAward[]>`
    SELECT t.id AS "transactionId", a.id AS "awardId", a."displayId", t."actionDate", t.obligation::text AS obligation,
           COALESCE(t.description, a.description) AS description, a.category::text AS category,
           ag.name AS "agencyName", sa.name AS "subAgencyName", a."sourceUrl"
    FROM "Award" a
    JOIN "AwardTransaction" t ON t."awardId" = a.id
    LEFT JOIN "Agency" ag ON ag.code = a."awardingAgencyCode"
    LEFT JOIN "SubAgency" sa ON sa.code = a."awardingSubCode"
    WHERE a."recipientId" = ${id}
      AND t."actionDate" >= ${from}::date
      AND t."availableAt" <= ${availableBefore}
    ORDER BY t.obligation DESC
    LIMIT ${limit}`;
}

export async function getFreshness(source = "usaspending") {
  return prisma.dataFreshness.findUnique({ where: { source } });
}
