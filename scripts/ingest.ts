import "dotenv/config";
import { parseArgs } from "node:util";
import { sendAlerts } from "@/jobs/alerts";
import { syncAgencies } from "@/jobs/agencies";
import { dodAnnouncements } from "@/jobs/dod-announcements";
import { edgarFilings } from "@/jobs/edgar-filings";
import { federalRegister } from "@/jobs/federal-register";
import { edgarCompanies } from "@/jobs/edgar-companies";
import { matchTickers } from "@/jobs/match-tickers";
import { syncPrices } from "@/jobs/prices";
import { rollupRecipients } from "@/jobs/rollup";
import { rollupCompanies } from "@/jobs/rollup-companies";
import { closeJobPool, withJobLock } from "@/jobs/runner";
import { samOpportunities } from "@/jobs/sam-opportunities";
import { samParents } from "@/jobs/sam-parents";
import { tagPrograms } from "@/jobs/tag-programs";
import { USASPENDING_LOCK, usaspendingBackfill, usaspendingDaily, usaspendingLoadLocal } from "@/jobs/usaspending";
import { flushJobMonitoring, initJobMonitoring, reportJobError } from "@/lib/monitoring/jobs";
import type { FileKind } from "@/lib/sources/usaspending/rows";

const USAGE = `Usage: pnpm ingest <job> [options]

Jobs:
  usaspending-backfill   Load the last N years month by month (resumable)
      --years <n>          default from src/config/data.ts
      --month YYYY-MM      only this month
      --kind contracts|assistance
      --force              reload chunks that already succeeded
      --limit <rows>       stop after N rows per chunk (smoke test)
  usaspending-daily      Load records modified since the last load, then roll up
  usaspending-file <path> Load a local bulk-download .zip or .csv
      --kind contracts|assistance   required for a CSV whose name doesn't say
      --incremental        treat rows as newly published (availableAt = now)
  usaspending-agencies   Refresh agency names and abbreviations
  rollup                 Rebuild recipient aggregates (incremental)
      --full               rebuild everything
  edgar-companies        Load SEC registrants/tickers, then former names + SIC (needs SEC_USER_AGENT)
      --file <path>        read company_tickers_exchange.json from disk (skips per-company lookups)
      --limit <n>          max companies to enrich this run
  sam-parents            Fill ultimate parents from SAM.gov for top recipients (needs SAM_API_KEY)
  match-tickers          Match recipients to public companies, then roll up company totals
      --full               re-match every eligible recipient
  rollup-companies       Rebuild company totals from current matches
  tag-programs           Sync programs from src/config/programs.ts and re-tag their awards
  prices                 Fetch daily stock bars for linked companies (needs MARKET_DATA_PROVIDER)
  alerts                 Email watchlist alerts for newly published awards (Pro)
  dod-announcements      defense.gov daily contract announcements (RSS)
      --file <path>        parse a saved announcement page instead (with --date YYYY-MM-DD)
  sam-opportunities      SAM.gov contract award notices, last 7 days (needs SAM_API_KEY)
  federal-register       Federal Register rules/notices for configured programs
  edgar-filings          8-Ks (screened for contract language) and 10-K Exhibit 21 subsidiaries
      --limit <n>          max companies this run
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      years: { type: "string" },
      month: { type: "string" },
      kind: { type: "string" },
      force: { type: "boolean" },
      limit: { type: "string" },
      incremental: { type: "boolean" },
      full: { type: "boolean" },
      file: { type: "string" },
      date: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const [job, arg] = positionals;
  if (!job || values.help) {
    console.log(USAGE);
    return;
  }
  initJobMonitoring(job);
  const kind = values.kind as FileKind | undefined;
  if (kind && kind !== "contracts" && kind !== "assistance") throw new Error(`bad --kind ${kind}`);
  const limit = values.limit ? Number(values.limit) : undefined;

  switch (job) {
    case "usaspending-backfill":
      await syncAgencies();
      await withJobLock(USASPENDING_LOCK, () =>
        usaspendingBackfill({
          years: values.years ? Number(values.years) : undefined,
          month: values.month,
          kinds: kind ? [kind] : undefined,
          force: values.force,
          limit,
        }),
      );
      await withJobLock("rollup", () => rollupRecipients());
      await withJobLock("programs", () => tagPrograms());
      break;
    case "usaspending-daily":
      await syncAgencies();
      await withJobLock(USASPENDING_LOCK, () => usaspendingDaily({ limit }));
      await withJobLock("rollup", () => rollupRecipients());
      await withJobLock("programs", () => tagPrograms());
      await withJobLock("mapping", () => matchAndRollup(false));
      await withJobLock("prices", () => syncPrices());
      // Secondary sources: a failure in one is logged and doesn't stop the others or alerts.
      await soft("dod-announcements", () => withJobLock("dod", () => dodAnnouncements()));
      await soft("sam-opportunities", () => withJobLock("sam", () => samOpportunities()));
      await soft("federal-register", () => withJobLock("fedreg", () => federalRegister()));
      await soft("edgar-filings", () => withJobLock("edgar", () => edgarFilings()));
      await withJobLock("alerts", () => sendAlerts());
      break;
    case "usaspending-file":
      if (!arg) throw new Error("usaspending-file needs a path");
      await withJobLock(USASPENDING_LOCK, () => usaspendingLoadLocal(arg, { kind, limit, incremental: values.incremental }));
      await withJobLock("rollup", () => rollupRecipients());
      break;
    case "usaspending-agencies":
      await syncAgencies();
      break;
    case "rollup":
      await withJobLock("rollup", () => rollupRecipients({ full: values.full }));
      break;
    case "edgar-companies":
      await withJobLock("edgar", () => edgarCompanies({ file: values.file, limit }));
      break;
    case "sam-parents":
      await withJobLock("sam", () => samParents({ limit }));
      break;
    case "match-tickers":
      await withJobLock("mapping", () => matchAndRollup(values.full ?? false));
      break;
    case "rollup-companies":
      await withJobLock("mapping", () => rollupCompanies());
      break;
    case "tag-programs":
      await withJobLock("programs", () => tagPrograms());
      break;
    case "prices":
      await withJobLock("prices", () => syncPrices({ limit }));
      break;
    case "alerts":
      await withJobLock("alerts", () => sendAlerts());
      break;
    case "dod-announcements":
      await withJobLock("dod", () => dodAnnouncements({ file: values.file, date: values.date }));
      break;
    case "sam-opportunities":
      await withJobLock("sam", () => samOpportunities());
      break;
    case "federal-register":
      await withJobLock("fedreg", () => federalRegister());
      break;
    case "edgar-filings":
      await withJobLock("edgar", () => edgarFilings({ limit }));
      break;
    default:
      console.error(`unknown job "${job}"\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

const softFailures: string[] = [];

/** Run a non-critical job; record failure (exit code 1 at the end) but keep going. */
async function soft(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    softFailures.push(name);
    console.error(`[${name}] failed:`, err);
    reportJobError(err, name);
  }
}

async function matchAndRollup(full: boolean) {
  await matchTickers({ full });
  // Admin decisions can move recipients between companies at any time; a full company
  // rollup after matching keeps every company's totals consistent.
  await rollupCompanies();
}

main()
  .then(() => {
    if (softFailures.length) {
      console.error(`Completed with failures in: ${softFailures.join(", ")}`);
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error(err);
    reportJobError(err, process.argv[2] ?? "ingest");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeJobPool();
    await flushJobMonitoring();
  });
