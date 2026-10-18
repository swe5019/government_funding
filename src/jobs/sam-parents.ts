import { mappingConfig } from "@/config/mapping";
import { fetchEntityParents } from "@/lib/sources/sam/client";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";
import { samRequestsLast24h } from "./sam-opportunities";

const RESYNC_DAYS = 90;

/**
 * Fill Recipient.ultimateParentUei from SAM.gov for the highest-dollar business recipients
 * that don't have one yet. Budgeted per day because SAM keys are rate limited.
 */
export async function samParents(opts: { log?: Logger; limit?: number } = {}) {
  const log = opts.log ?? consoleLogger;
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    log.info("SAM_API_KEY not set; skipping SAM parent lookup (USAspending parent UEIs are still used)");
    return;
  }
  const dailyLimit = Number(process.env.SAM_DAILY_LIMIT ?? 900);
  const db = jobPool();
  // The key's quota is shared with the award-notices job (counted conservatively per run).
  const budget = Math.min(opts.limit ?? Infinity, dailyLimit - (await samRequestsLast24h()));
  if (budget <= 0) {
    log.info("SAM daily request budget used up; skipping");
    return;
  }

  const { rows } = await db.query<{ id: string; uei: string }>(
    `SELECT r.id, r.uei FROM "Recipient" r
     JOIN (SELECT "recipientId", SUM(obligated) AS total FROM "RecipientAwardMonthly"
           WHERE view = 'REALTIME' GROUP BY 1) m ON m."recipientId" = r.id
     WHERE r.uei IS NOT NULL AND r."recipientType" IN ('BUSINESS', 'UNKNOWN')
       AND r."ultimateParentUei" IS NULL
       AND (r."samLastSyncedAt" IS NULL OR r."samLastSyncedAt" < now() - make_interval(days => $1))
       AND m.total >= $2
     ORDER BY m.total DESC LIMIT $3`,
    [RESYNC_DAYS, mappingConfig.minObligationUsd, budget],
  );
  if (!rows.length) return;

  await runChunk(
    { job: "sam_parents", chunkKey: new Date().toISOString(), params: { requested: rows.length }, force: true, attempts: 1, log },
    async ({ client, stats }) => {
      for (const r of rows) {
        stats.rowsRead++;
        try {
          const p = await fetchEntityParents(r.uei, apiKey);
          const ultimate = p?.ultimateParentUei ?? p?.immediateParentUei ?? null;
          await client.query(
            `UPDATE "Recipient" SET "ultimateParentUei" = $2,
               "parentUei" = COALESCE("parentUei", $3), "samLastSyncedAt" = now(), "updatedAt" = now()
             WHERE id = $1`,
            [r.id, ultimate && ultimate !== r.uei ? ultimate : null, p?.immediateParentUei ?? null],
          );
          if (ultimate) stats.rowsUpserted++;
        } catch (err) {
          stats.rowsSkipped++;
          log.error(`SAM ${r.uei}: ${err instanceof Error ? err.message : err}`);
          // A 429 means the key's quota is exhausted; stop instead of burning retries.
          if (err instanceof Error && / 429/.test(err.message)) break;
        }
      }
    },
  );
}
