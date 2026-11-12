import { dataConfig } from "@/config/data";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";

const BATCH = 20_000;
/** Tables that shrink when awards are deleted (transactions and program tags cascade). */
const COMPACT = ["AwardTransaction", "AwardProgram", "Award"];

/**
 * Delete stored awards whose total obligation is below the storage cutoff (their transactions
 * and program tags cascade), then compact the tables so the database file actually shrinks:
 * Postgres only marks deleted rows reusable, and Neon bills the file size.
 *
 * VACUUM FULL locks each table while it rewrites it (seconds to a few minutes), so pages
 * reading awards wait meanwhile. Callers must rebuild the aggregates afterwards with full
 * rollups: deleted rows leave nothing for the incremental rollups to notice.
 */
export async function pruneAwards(opts: { minAwardUsd?: number; compact?: boolean; log?: Logger } = {}) {
  const log = opts.log ?? consoleLogger;
  const min = opts.minAwardUsd ?? dataConfig.minAwardUsd;
  if (!min) {
    log.info("storage cutoff is 0: nothing to prune");
    return;
  }

  await runChunk(
    { job: "prune_awards", chunkKey: `min${min}`, params: { minAwardUsd: min }, force: true, attempts: 2, log },
    async ({ client, stats }) => {
      for (;;) {
        // One statement per batch keeps each transaction (and its WAL) small.
        const r = await client.query(
          `DELETE FROM "Award" WHERE id IN (
             SELECT id FROM "Award" WHERE abs("totalObligated") < $1 LIMIT ${BATCH})`,
          [min],
        );
        const n = r.rowCount ?? 0;
        stats.rowsUpserted += n;
        if (n) log.info(`  deleted ${stats.rowsUpserted.toLocaleString()} awards so far`);
        if (n < BATCH) break;
      }
      log.info(`deleted ${stats.rowsUpserted.toLocaleString()} awards under $${min.toLocaleString()}`);
    },
  );

  if (opts.compact === false) return;
  const db = jobPool();
  for (const table of COMPACT) {
    log.info(`compacting ${table}`);
    await db.query(`VACUUM (FULL, ANALYZE) "${table}"`);
  }
}
