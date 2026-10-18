import { featureConfig } from "@/config/features";
import { prisma } from "@/lib/db";
import type { DataWindow } from "@/lib/gating/dataCutoff";

export interface FeedItem {
  transactionId: string;
  availableAt: Date;
  actionDate: Date;
  obligation: string;
  description: string | null;
  recipientId: string;
  recipientName: string;
  agencyName: string | null;
  ticker: string;
  companyName: string;
  matchStatus: string;
  matchConfidence: number;
  matchCik: string;
  sourceUrl: string;
}

/**
 * Newly published large awards to recipients linked to public companies, newest first.
 * "Published" is availableAt (when the record first appeared), so modifications to old awards
 * show up when they're new. Possible (unverified) links are included and labeled by the UI.
 */
export async function getLargeAwardsFeed(
  win: DataWindow,
  opts: { minUsd: number; days: number; limit?: number; now?: Date },
): Promise<FeedItem[]> {
  const now = opts.now ?? new Date();
  const until = win.availableBefore && win.availableBefore < now ? win.availableBefore : now;
  const since = new Date(until.getTime() - opts.days * 86_400_000);
  return prisma.$queryRaw<FeedItem[]>`
    SELECT t.id AS "transactionId", t."availableAt", t."actionDate", t.obligation::text AS obligation,
           COALESCE(t.description, a.description) AS description, r.id AS "recipientId", r.name AS "recipientName",
           COALESCE(sa.name, ag.name) AS "agencyName", c.ticker, c.name AS "companyName",
           tm.status::text AS "matchStatus", tm.confidence AS "matchConfidence", tm."companyCik" AS "matchCik", a."sourceUrl"
    FROM "AwardTransaction" t
    JOIN "Award" a ON a.id = t."awardId"
    JOIN "Recipient" r ON r.id = a."recipientId"
    JOIN "TickerMatch" tm ON tm."recipientId" = a."recipientId" AND tm.status <> 'REJECTED' AND tm."companyCik" IS NOT NULL
    JOIN "Company" c ON c.cik = tm."companyCik"
    LEFT JOIN "Agency" ag ON ag.code = a."awardingAgencyCode"
    LEFT JOIN "SubAgency" sa ON sa.code = a."awardingSubCode"
    WHERE t."availableAt" > ${since} AND t."availableAt" <= ${until} AND t.obligation >= ${opts.minUsd}
    ORDER BY t."availableAt" DESC, t.obligation DESC
    LIMIT ${opts.limit ?? featureConfig.feed.pageSize}`;
}
