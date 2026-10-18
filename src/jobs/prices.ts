import { dataConfig } from "@/config/data";
import { getProvider } from "@/lib/market-data";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import { consoleLogger, jobPool, markFresh, runChunk, type Logger } from "./runner";

const OVERLAP_DAYS = 5;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Store daily bars for companies with at least one confirmed award link. Incremental per
 * company (from its last stored bar minus a few days, to pick up vendor corrections).
 * Does nothing when no provider is configured.
 */
export async function syncPrices(opts: { log?: Logger; limit?: number } = {}) {
  const log = opts.log ?? consoleLogger;
  const provider = getProvider();
  if (!provider) {
    log.info("MARKET_DATA_PROVIDER not set; skipping prices");
    return;
  }
  const { rows: companies } = await jobPool().query<{ cik: string; ticker: string; last: Date | null }>(
    `SELECT c.cik, c.ticker, (SELECT MAX(date) FROM "PriceBar" p WHERE p."companyCik" = c.cik AND p.provider = $1) AS last
     FROM "Company" c
     WHERE c.ticker NOT LIKE 'X:%' AND EXISTS (SELECT 1 FROM "TickerMatch" tm WHERE tm."companyCik" = c.cik AND ${CONFIRMED_SQL})
     ORDER BY c.cik LIMIT $2`,
    [provider.name, opts.limit ?? 100_000],
  );
  const today = new Date();
  const earliest = new Date(Date.UTC(today.getUTCFullYear() - dataConfig.backfillYears, today.getUTCMonth(), 1));

  await runChunk(
    { job: "prices", chunkKey: iso(today), params: { provider: provider.name, companies: companies.length }, force: true, attempts: 1, log },
    async ({ client, stats }) => {
      for (const c of companies) {
        const from = c.last ? new Date(c.last.getTime() - OVERLAP_DAYS * 86_400_000) : earliest;
        try {
          const bars = await provider.getDailyBars(c.ticker, iso(from), iso(today));
          stats.rowsRead += bars.length;
          if (!bars.length) continue;
          const r = await client.query(
            `INSERT INTO "PriceBar" ("companyCik", date, open, high, low, close, volume, provider)
             SELECT $1, u.date, u.open, u.high, u.low, u.close, u.volume, $2
             FROM unnest($3::date[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::bigint[])
               AS u(date, open, high, low, close, volume)
             ON CONFLICT ("companyCik", date) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high,
               low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume, provider = EXCLUDED.provider`,
            [
              c.cik,
              provider.name,
              bars.map((b) => b.date),
              bars.map((b) => b.open),
              bars.map((b) => b.high),
              bars.map((b) => b.low),
              bars.map((b) => b.close),
              bars.map((b) => b.volume),
            ],
          );
          stats.rowsUpserted += r.rowCount ?? 0;
        } catch (err) {
          stats.rowsSkipped++;
          log.error(`prices ${c.ticker}: ${err instanceof Error ? err.message : err}`);
        }
      }
    },
  );
  await markFresh(`prices:${provider.name}`, iso(today));
}
