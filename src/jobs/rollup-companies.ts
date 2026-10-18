import { FREE_TIER_DELAY_DAYS } from "@/config/plans";
import { COMPANY_ROLLUP_DELETE, COMPANY_ROLLUP_INSERT } from "@/lib/mapping/sql";
import { consoleLogger, runChunk, type Logger } from "./runner";

/** Rebuild company-level monthly totals from confirmed and possible ticker matches. */
export async function rollupCompanies(opts: { ciks?: string[]; log?: Logger } = {}) {
  const ciks = opts.ciks?.length ? opts.ciks : null;
  await runChunk(
    {
      job: "rollup_companies",
      chunkKey: ciks ? `ciks:${ciks.length}` : "full",
      params: { ciks },
      force: true,
      attempts: 2,
      baseDelayMs: 10_000,
      log: opts.log ?? consoleLogger,
    },
    async ({ client, stats }) => {
      const cutoff = new Date(Date.now() - FREE_TIER_DELAY_DAYS * 86_400_000);
      await client.query("BEGIN");
      try {
        await client.query(COMPANY_ROLLUP_DELETE, [ciks]);
        const r = await client.query(COMPANY_ROLLUP_INSERT, [cutoff, ciks]);
        stats.rowsUpserted = r.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
  );
}
