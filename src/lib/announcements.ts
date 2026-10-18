import { prisma } from "@/lib/db";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";

/**
 * Early signals that arrive before USAspending: DoD daily contract announcements and SAM.gov
 * award notices, linked to companies through the same recipient ticker matches as awards
 * (confirmed links only). Plus SEC 8-Ks screened for contract language, and Federal Register
 * documents for programs.
 */

export interface Announcement {
  source: "DoD" | "SAM.gov";
  id: string;
  date: Date;
  title: string;
  recipientName: string;
  amount: string | null;
  contractNumber: string | null;
  agency: string | null;
  url: string;
  ticker: string;
  companyName: string;
}

/**
 * Announcements for one company, or all companies (feed) when cik is null. `availableBefore`
 * applies the free-tier delay using when we loaded each item.
 */
export async function getAnnouncements(
  cik: string | null,
  opts: { days: number; availableBefore: Date | null; limit?: number; minUsd?: number },
): Promise<Announcement[]> {
  return prisma.$queryRawUnsafe<Announcement[]>(
    `SELECT * FROM (
       SELECT 'DoD' AS source, d.id, d."announcementDate" AS date, CASE WHEN length(d.text) > 300 THEN left(d.text, 297) || '…' ELSE d.text END AS title, d."contractorName" AS "recipientName",
              d.amount::text AS amount, d."contractNumber", COALESCE(d."contractingActivity", d.branch) AS agency, d.url,
              c.ticker, c.name AS "companyName"
       FROM "DodAnnouncement" d
       JOIN "TickerMatch" tm ON tm."recipientId" = d."recipientId" AND ${CONFIRMED_SQL}
       JOIN "Company" c ON c.cik = tm."companyCik"
       WHERE d."announcementDate" > now() - make_interval(days => $2) AND ($1::text IS NULL OR tm."companyCik" = $1)
         AND COALESCE(d.amount, 0) >= $4 AND d."createdAt" <= $5
       UNION ALL
       SELECT 'SAM.gov', n."noticeId", COALESCE(n."awardDate", n."postedDate"), n.title, COALESCE(n."awardeeName", ''),
              n.amount::text, n."awardNumber", COALESCE(n.office, n.department), n.url, c.ticker, c.name
       FROM "SamAwardNotice" n
       JOIN "TickerMatch" tm ON tm."recipientId" = n."awardeeUei" AND ${CONFIRMED_SQL}
       JOIN "Company" c ON c.cik = tm."companyCik"
       WHERE n."postedDate" > now() - make_interval(days => $2) AND ($1::text IS NULL OR tm."companyCik" = $1)
         AND COALESCE(n.amount, 0) >= $4 AND n."createdAt" <= $5
     ) x
     ORDER BY date DESC, amount::numeric DESC NULLS LAST
     LIMIT $3`,
    cik,
    opts.days,
    opts.limit ?? 50,
    opts.minUsd ?? 0,
    opts.availableBefore ?? new Date("9999-12-31T00:00:00Z"),
  );
}

export async function getContractFilings(cik: string, days = 365) {
  return prisma.secFiling.findMany({
    where: { companyCik: cik, form: "8-K", mentionsAward: true, filedAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { filedAt: "desc" },
    take: 10,
  });
}

export async function getProgramDocuments(slug: string, limit = 10) {
  return prisma.federalRegisterDoc.findMany({ where: { programSlug: slug }, orderBy: { publishedAt: "desc" }, take: limit });
}
