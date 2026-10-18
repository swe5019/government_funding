import { featureConfig } from "@/config/features";
import { plans } from "@/config/plans";
import { PAID_STATUSES_LIST, PERIOD_GRACE_MS } from "@/lib/billing/entitlements";
import { sendEmail } from "@/lib/email/send";
import { alertDigestEmail, type AlertAward } from "@/lib/email/templates";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";

interface Candidate extends AlertAward {
  userId: string;
  email: string;
  companyCik: string;
  transactionId: string;
}

/**
 * Email watchlist alerts: for users whose plan includes alerts, awards to watched companies
 * (confirmed links) at or above the item's threshold, published since the company was added
 * and within the lookback window. AlertDelivery rows are claimed before sending (unique per
 * user+transaction), so overlapping or repeated runs never email the same award twice; a failed
 * send releases its claims so the next run retries.
 */
export async function sendAlerts(opts: { log?: Logger; now?: Date } = {}) {
  const log = opts.log ?? consoleLogger;
  const now = opts.now ?? new Date();
  const alertPlans = Object.values(plans).filter((p) => p.entitlements.emailAlerts).map((p) => p.key);
  const since = new Date(now.getTime() - featureConfig.alerts.lookbackDays * 86_400_000);

  await runChunk(
    { job: "alerts", chunkKey: now.toISOString(), params: { since: since.toISOString() }, force: true, attempts: 1, log },
    async ({ client, stats }) => {
      const { rows } = await client.query<Candidate & { obligation: string }>(
        `SELECT DISTINCT ON (u.id, t.id)
                u.id AS "userId", u.email, wi."companyCik", t.id AS "transactionId",
                c.ticker, c.name AS "companyName", r.name AS "recipientName", t.obligation::text AS obligation,
                t."actionDate", COALESCE(sa.name, ag.name) AS "agencyName", COALESCE(t.description, a.description) AS description,
                a."sourceUrl"
         FROM "WatchlistItem" wi
         JOIN "Watchlist" w ON w.id = wi."watchlistId"
         JOIN "User" u ON u.id = w."userId"
         JOIN "Subscription" s ON s."userId" = u.id
         JOIN "Company" c ON c.cik = wi."companyCik"
         JOIN "TickerMatch" tm ON tm."companyCik" = wi."companyCik" AND ${CONFIRMED_SQL}
         JOIN "Recipient" r ON r.id = tm."recipientId"
         JOIN "Award" a ON a."recipientId" = tm."recipientId"
         JOIN "AwardTransaction" t ON t."awardId" = a.id
         LEFT JOIN "Agency" ag ON ag.code = a."awardingAgencyCode"
         LEFT JOIN "SubAgency" sa ON sa.code = a."awardingSubCode"
         WHERE wi."alertThreshold" IS NOT NULL AND t.obligation >= wi."alertThreshold"
           AND t."availableAt" > GREATEST($1::timestamptz, wi."createdAt") AND t."availableAt" <= $2
           AND s.status = ANY($3::text[]) AND s."planKey" = ANY($4::text[])
           AND s."currentPeriodEnd" > $2::timestamptz - make_interval(secs => $5)
           AND NOT EXISTS (SELECT 1 FROM "AlertDelivery" d WHERE d."userId" = u.id AND d."transactionId" = t.id)
         ORDER BY u.id, t.id`,
        [since, now, PAID_STATUSES_LIST, alertPlans, PERIOD_GRACE_MS / 1000],
      );
      stats.rowsRead = rows.length;

      const byUser = new Map<string, Candidate[]>();
      for (const r of rows) {
        const list = byUser.get(r.userId) ?? [];
        list.push({ ...r, obligation: Number(r.obligation) });
        byUser.set(r.userId, list);
      }

      for (const [userId, items] of byUser) {
        // Claim first; only awards this run claimed get emailed.
        const claimed = await client.query<{ transactionId: string }>(
          `INSERT INTO "AlertDelivery" (id, "userId", "companyCik", "transactionId", "sentAt")
           SELECT gen_random_uuid()::text, $1, u.cik, u.tx, now() FROM unnest($2::text[], $3::text[]) AS u(cik, tx)
           ON CONFLICT ("userId", "transactionId") DO NOTHING RETURNING "transactionId"`,
          [userId, items.map((i) => i.companyCik), items.map((i) => i.transactionId)],
        );
        const ids = new Set(claimed.rows.map((r) => r.transactionId));
        const mine = items.filter((i) => ids.has(i.transactionId)).sort((a, b) => b.obligation - a.obligation);
        if (!mine.length) continue;
        const shown = mine.slice(0, featureConfig.alerts.maxAwardsPerEmail);
        try {
          await sendEmail(alertDigestEmail(mine[0].email, shown, mine.length - shown.length));
          stats.rowsUpserted += mine.length;
        } catch (err) {
          await client.query(`DELETE FROM "AlertDelivery" WHERE "userId" = $1 AND "transactionId" = ANY($2::text[])`, [userId, [...ids]]);
          stats.rowsSkipped += mine.length;
          log.error(`alert email for user ${userId} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (stats.rowsSkipped && !stats.rowsUpserted) throw new Error(`all ${stats.rowsSkipped} alert emails failed`);
    },
  );
}

/** Kept separate so tests can count deliveries without sending. */
export async function alertDeliveries(userId: string) {
  return (await jobPool().query(`SELECT "transactionId" FROM "AlertDelivery" WHERE "userId" = $1 ORDER BY 1`, [userId])).rows.map(
    (r) => r.transactionId as string,
  );
}
