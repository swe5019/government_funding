import "dotenv/config";
import { parseArgs } from "node:util";
import { syncAgencies } from "@/jobs/agencies";
import { rollupRecipients } from "@/jobs/rollup";
import { closeJobPool, withJobLock } from "@/jobs/runner";
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
      break;
    case "usaspending-daily":
      await syncAgencies();
      await withJobLock(USASPENDING_LOCK, () => usaspendingDaily({ limit }));
      await withJobLock("rollup", () => rollupRecipients());
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
    default:
      console.error(`unknown job "${job}"\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeJobPool);
