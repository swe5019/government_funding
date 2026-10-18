import { readFile } from "node:fs/promises";
import { normalizeName } from "@/lib/mapping/normalize";
import { fetchSubmissions, fetchTickersFile, parseTickersFile, type TickersFile } from "@/lib/sources/edgar/client";
import { sectorForSic } from "@/lib/sources/edgar/sic";
import { consoleLogger, jobPool, markFresh, runChunk, type Logger } from "./runner";

const SUBMISSIONS_MAX_AGE_DAYS = 30;

export interface EdgarOptions {
  /** Read company_tickers_exchange.json from disk instead of sec.gov. */
  file?: string;
  /** Skip per-company submissions (former names, SIC). */
  skipSubmissions?: boolean;
  /** Max companies to fetch submissions for in this run. */
  limit?: number;
  log?: Logger;
}

/** Load SEC registrants with tickers into Company, then enrich major-exchange ones. */
export async function edgarCompanies(opts: EdgarOptions = {}) {
  const log = opts.log ?? consoleLogger;
  const today = new Date().toISOString().slice(0, 10);

  await runChunk(
    { job: "edgar_companies", chunkKey: today, params: { file: opts.file ?? null }, force: true, log },
    async ({ client, stats }) => {
      const raw: TickersFile = opts.file ? JSON.parse(await readFile(opts.file, "utf8")) : await fetchTickersFile();
      const companies = parseTickersFile(raw);
      stats.rowsRead = companies.length;
      if (companies.length < 100 && !opts.file) throw new Error(`SEC tickers file has only ${companies.length} companies; refusing to apply`);

      await client.query("BEGIN");
      try {
        // Tickers move between registrants and companies delist. Park tickers that are no
        // longer this company's (they're unique) before upserting the current list.
        await client.query(
          `UPDATE "Company" c SET ticker = 'X:' || c.cik, tickers = '{}', "isMajorExchange" = false, "updatedAt" = now()
           WHERE c.ticker NOT LIKE 'X:%'
             AND NOT EXISTS (SELECT 1 FROM unnest($1::text[], $2::text[]) AS n(cik, ticker)
                             WHERE n.cik = c.cik AND n.ticker = c.ticker)`,
          [companies.map((c) => c.cik), companies.map((c) => c.ticker)],
        );
        const res = await client.query(
          `INSERT INTO "Company" (cik, ticker, tickers, name, "normalizedName", exchange, "isMajorExchange", "createdAt", "updatedAt")
           SELECT u.cik, u.ticker, ARRAY(SELECT jsonb_array_elements_text(u.tickers)), u.name, u.norm, u.exchange, u.major, now(), now()
           FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::text[], $5::text[], $6::text[], $7::boolean[])
             AS u(cik, ticker, tickers, name, norm, exchange, major)
           ON CONFLICT (cik) DO UPDATE SET
             ticker = EXCLUDED.ticker, tickers = EXCLUDED.tickers, name = EXCLUDED.name,
             "normalizedName" = EXCLUDED."normalizedName", exchange = EXCLUDED.exchange,
             "isMajorExchange" = EXCLUDED."isMajorExchange", "updatedAt" = now()
           WHERE ("Company".ticker, "Company".tickers, "Company".name, "Company".exchange, "Company"."isMajorExchange")
                 IS DISTINCT FROM
                 (EXCLUDED.ticker, EXCLUDED.tickers, EXCLUDED.name, EXCLUDED.exchange, EXCLUDED."isMajorExchange")`,
          [
            companies.map((c) => c.cik),
            companies.map((c) => c.ticker),
            companies.map((c) => JSON.stringify(c.tickers)),
            companies.map((c) => c.name),
            companies.map((c) => c.normalizedName),
            companies.map((c) => c.exchange),
            companies.map((c) => c.isMajorExchange),
          ],
        );
        stats.rowsUpserted = res.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
  );
  await markFresh("edgar", today);

  if (opts.skipSubmissions || opts.file) return;
  await edgarSubmissions({ limit: opts.limit, log });
}

/** Former names (-> CompanyAlias) and SIC/sector for major-exchange companies, oldest first. */
export async function edgarSubmissions(opts: { limit?: number; log?: Logger } = {}) {
  const log = opts.log ?? consoleLogger;
  const { rows } = await jobPool().query<{ cik: string }>(
    `SELECT cik FROM "Company"
     WHERE "isMajorExchange" AND ("secLastSyncedAt" IS NULL OR "secLastSyncedAt" < now() - make_interval(days => $1))
     ORDER BY "secLastSyncedAt" NULLS FIRST LIMIT $2`,
    [SUBMISSIONS_MAX_AGE_DAYS, opts.limit ?? 100_000],
  );
  if (!rows.length) return;

  await runChunk(
    {
      job: "edgar_submissions",
      chunkKey: new Date().toISOString(),
      params: { companies: rows.length },
      force: true,
      attempts: 1,
      log,
    },
    async ({ client, stats }) => {
      for (const { cik } of rows) {
        stats.rowsRead++;
        try {
          const sub = await fetchSubmissions(cik);
          const former = (sub.formerNames ?? []).map((f) => f.name).filter(Boolean);
          for (const alias of former) {
            const r = await client.query(
              `INSERT INTO "CompanyAlias" (id, "companyCik", alias, normalized, source)
               VALUES (gen_random_uuid()::text, $1, $2, $3, 'EDGAR_FORMER_NAME')
               ON CONFLICT ("companyCik", normalized) DO NOTHING`,
              [cik, alias, normalizeName(alias)],
            );
            stats.rowsUpserted += r.rowCount ?? 0;
          }
          await client.query(
            `UPDATE "Company" SET "sicCode" = $2, sector = $3, "secLastSyncedAt" = now(), "updatedAt" = now() WHERE cik = $1`,
            [cik, sub.sic ?? null, sectorForSic(sub.sic)],
          );
        } catch (err) {
          // One bad company shouldn't sink the batch; it stays stale and is retried next run.
          stats.rowsSkipped++;
          log.error(`submissions ${cik}: ${err instanceof Error ? err.message : err}`);
        }
        if (stats.rowsRead % 500 === 0) log.info(`  submissions: ${stats.rowsRead}/${rows.length}`);
      }
      if (stats.rowsSkipped > rows.length / 2) throw new Error(`${stats.rowsSkipped} of ${rows.length} submissions failed`);
    },
  );
}
