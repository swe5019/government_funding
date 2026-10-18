import "dotenv/config";
import { parseArgs } from "node:util";
import { syncAgencies } from "@/jobs/agencies";
import { edgarCompanies } from "@/jobs/edgar-companies";
import { matchTickers } from "@/jobs/match-tickers";
import { syncPrices } from "@/jobs/prices";
import { rollupRecipients } from "@/jobs/rollup";
import { rollupCompanies } from "@/jobs/rollup-companies";
import { closeJobPool, withJobLock } from "@/jobs/runner";
import { samParents } from "@/jobs/sam-parents";
import { tagPrograms } from "@/jobs/tag-programs";
import { USASPENDING_LOCK, usaspendingBackfill, usaspendingDaily, usaspendingLoadLocal } from "@/jobs/usaspending";
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
      help: { type: "boolean" },
    },
  });
  const [job, arg] = positionals;
  if (!job || values.help) {
    console.log(USAGE);
    return;
  }
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
    default:
      console.error(`unknown job "${job}"\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

async function matchAndRollup(full: boolean) {
  await matchTickers({ full });
  // Admin decisions can move recipients between companies at any time; a full company
  // rollup after matching keeps every company's totals consistent.
  await rollupCompanies();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeJobPool);
