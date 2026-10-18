import { normalizeName } from "@/lib/mapping/normalize";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import { fetchSecText, fetchSubmissions, type Submissions } from "@/lib/sources/edgar/client";
import { archiveBase, exhibit21Links, parseExhibit21, recentFilings, screenForGovernmentContract } from "@/lib/sources/edgar/filings";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";

export interface EdgarFetchers {
  submissions: (cik: string) => Promise<Submissions>;
  text: (url: string) => Promise<string>;
}

const DEFAULT_FETCHERS: EdgarFetchers = { submissions: fetchSubmissions, text: fetchSecText };
const EIGHT_K_LOOKBACK_DAYS = 365;
/** Only fresh 8-Ks get their document fetched and keyword-screened. */
const SCREEN_DAYS = 30;
const MAX_DOC_FETCHES_PER_RUN = 500;

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/**
 * For companies with confirmed award links: record recent 8-Ks (screening fresh ones for
 * government-contract language) and, when a new 10-K appears, refresh its Exhibit 21
 * subsidiaries as CompanyAlias rows (used by the matcher). Each company's failures are
 * logged and skipped so one bad filing doesn't stop the run.
 */
export async function edgarFilings(opts: { log?: Logger; limit?: number; fetchers?: EdgarFetchers } = {}) {
  const log = opts.log ?? consoleLogger;
  const f = opts.fetchers ?? DEFAULT_FETCHERS;
  const { rows: companies } = await jobPool().query<{ cik: string }>(
    `SELECT DISTINCT tm."companyCik" AS cik FROM "TickerMatch" tm WHERE ${CONFIRMED_SQL} ORDER BY 1 LIMIT $1`,
    [opts.limit ?? 100_000],
  );
  let aliasesChanged = 0;

  await runChunk(
    { job: "edgar_filings", chunkKey: new Date().toISOString(), params: { companies: companies.length }, force: true, attempts: 1, log },
    async ({ client, stats }) => {
      let docFetches = 0;
      for (const { cik } of companies) {
        stats.rowsRead++;
        try {
          const sub = await f.submissions(cik);

          // 8-Ks: metadata for the past year; fetch + screen documents filed in the last month.
          for (const k of recentFilings(sub, cik, ["8-K"], isoDaysAgo(EIGHT_K_LOOKBACK_DAYS))) {
            const ins = await client.query(
              `INSERT INTO "SecFiling" (accession, "companyCik", form, "filedAt", items, title, url, "matchedTerms")
               VALUES ($1, $2, $3, $4::date, $5, $6, $7, '{}') ON CONFLICT (accession) DO NOTHING`,
              [k.accession, cik, k.form, k.filedAt, k.items, k.title, k.url],
            );
            if (!ins.rowCount || k.filedAt < isoDaysAgo(SCREEN_DAYS) || docFetches >= MAX_DOC_FETCHES_PER_RUN) continue;
            docFetches++;
            const screen = screenForGovernmentContract(await f.text(k.url));
            await client.query(`UPDATE "SecFiling" SET "mentionsAward" = $2, "matchedTerms" = $3 WHERE accession = $1`, [
              k.accession,
              screen.mentionsAward,
              screen.matchedTerms,
            ]);
            stats.rowsUpserted++;
          }

          // Exhibit 21 from the latest 10-K, once per 10-K.
          const [tenK] = recentFilings(sub, cik, ["10-K"], isoDaysAgo(550));
          if (tenK) {
            const seen = await client.query(`SELECT 1 FROM "SecFiling" WHERE accession = $1`, [tenK.accession]);
            if (!seen.rowCount) {
              const index = await f.text(`${archiveBase(cik, tenK.accession)}/${tenK.accession}-index.htm`);
              const names = (await Promise.all(exhibit21Links(index, cik, tenK.accession).map((u) => f.text(u)))).flatMap(parseExhibit21);
              await client.query("BEGIN");
              try {
                await client.query(`DELETE FROM "CompanyAlias" WHERE "companyCik" = $1 AND source = 'EX21_SUBSIDIARY'`, [cik]);
                for (const name of names) {
                  const norm = normalizeName(name);
                  if (norm.length < 3) continue;
                  await client.query(
                    `INSERT INTO "CompanyAlias" (id, "companyCik", alias, normalized, source) VALUES (gen_random_uuid()::text, $1, $2, $3, 'EX21_SUBSIDIARY')
                     ON CONFLICT ("companyCik", normalized) DO NOTHING`,
                    [cik, name, norm],
                  );
                }
                await client.query(
                  `INSERT INTO "SecFiling" (accession, "companyCik", form, "filedAt", title, url, "matchedTerms")
                   VALUES ($1, $2, '10-K', $3::date, $4, $5, $6)`,
                  [tenK.accession, cik, tenK.filedAt, tenK.title, tenK.url, names.length ? [`${names.length} subsidiaries`] : []],
                );
                await client.query("COMMIT");
              } catch (e) {
                await client.query("ROLLBACK");
                throw e;
              }
              aliasesChanged += names.length;
            }
          }
        } catch (err) {
          stats.rowsSkipped++;
          log.error(`edgar filings ${cik}: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (companies.length && stats.rowsSkipped === companies.length) throw new Error("every company failed");
    },
  );

  // A marker run so the next match-tickers does a full re-match with the new subsidiary aliases.
  if (aliasesChanged) {
    await runChunk(
      { job: "edgar_subsidiaries", chunkKey: new Date().toISOString(), params: { aliases: aliasesChanged }, force: true, attempts: 1, log },
      async ({ stats }) => {
        stats.rowsUpserted = aliasesChanged;
      },
    );
  }
}
