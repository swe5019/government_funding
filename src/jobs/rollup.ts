import { FREE_TIER_DELAY_DAYS } from "@/config/plans";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";

/**
 * Rebuilds RecipientAwardMonthly, the aggregate behind search results and totals.
 *
 * Two views are kept:
 *   REALTIME — every transaction we have (paid tier)
 *   DELAYED  — only transactions public for at least FREE_TIER_DELAY_DAYS (free tier)
 *
 * Incremental runs recompute only recipients whose data changed since the last successful
 * rollup, plus recipients whose transactions crossed the delay line since then.
 */

const AGG_SQL = (recipientFilter: string) => `
  INSERT INTO "RecipientAwardMonthly" ("recipientId", view, month, obligated, "txCount")
  SELECT a."recipientId", v.view::"DataView", date_trunc('month', t."actionDate")::date,
         SUM(t.obligation), COUNT(*)
  FROM "AwardTransaction" t
  JOIN "Award" a ON a.id = t."awardId"
  CROSS JOIN (VALUES ('REALTIME'), ('DELAYED')) AS v(view)
  WHERE a."recipientId" IS NOT NULL
    AND (v.view = 'REALTIME' OR t."availableAt" <= $1::timestamptz)
    ${recipientFilter}
  GROUP BY 1, 2, 3`;

export async function rollupRecipients(opts: { full?: boolean; log?: Logger } = {}) {
  const log = opts.log ?? consoleLogger;
  const db = jobPool();
  const { rows: last } = await db.query<{ startedAt: Date }>(
    `SELECT "startedAt" FROM "IngestionRun" WHERE job = 'rollup_recipients' AND status = 'SUCCEEDED'
     ORDER BY "startedAt" DESC LIMIT 1`,
  );
  const since = opts.full ? null : (last[0]?.startedAt ?? null);

  await runChunk(
    {
      job: "rollup_recipients",
      chunkKey: since ? `incremental:${since.toISOString()}` : "full",
      params: { since: since?.toISOString() ?? null, delayDays: FREE_TIER_DELAY_DAYS },
      force: true,
      attempts: 2,
      baseDelayMs: 10_000,
      log,
    },
    async ({ client, stats }) => {
      const { rows } = await client.query<{ now: Date; cutoff: Date }>(
        `SELECT now() AS now, now() - make_interval(days => $1) AS cutoff`,
        [FREE_TIER_DELAY_DAYS],
      );
      const cutoff = rows[0].cutoff;

      await client.query("BEGIN");
      try {
        if (!since) {
          await client.query(`TRUNCATE "RecipientAwardMonthly"`);
          const r = await client.query(AGG_SQL(""), [cutoff]);
          stats.rowsUpserted = r.rowCount ?? 0;
        } else {
          const prevCutoff = new Date(since.getTime() - FREE_TIER_DELAY_DAYS * 86_400_000);
          await client.query(`
            CREATE TEMP TABLE touched ON COMMIT DROP AS
            SELECT DISTINCT a."recipientId" AS id
            FROM "AwardTransaction" t JOIN "Award" a ON a.id = t."awardId"
            WHERE a."recipientId" IS NOT NULL
              AND (t."updatedAt" >= $1 OR (t."availableAt" > $2 AND t."availableAt" <= $3))
            UNION
            SELECT "recipientId" FROM "Award" WHERE "updatedAt" >= $1 AND "recipientId" IS NOT NULL`,
            [since, prevCutoff, cutoff],
          );
          const { rows: c } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM touched`);
          stats.rowsRead = Number(c[0].n);
          await client.query(`DELETE FROM "RecipientAwardMonthly" WHERE "recipientId" IN (SELECT id FROM touched)`);
          const r = await client.query(AGG_SQL(`AND a."recipientId" IN (SELECT id FROM touched)`), [cutoff]);
          stats.rowsUpserted = r.rowCount ?? 0;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
  );
}
