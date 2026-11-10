import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dataConfig } from "@/config/data";
import { downloadToFile, requestBulkDownload, waitForDownload, type BulkDownloadRequest } from "@/lib/sources/usaspending/client";
import type { FileKind } from "@/lib/sources/usaspending/rows";
import { loadUsaspendingFile } from "./load-usaspending-file";
import { consoleLogger, jobPool, markFresh, runChunk, type ChunkContext, type Logger } from "./runner";
import type { AvailabilityMode } from "./upsert";

export const USASPENDING_LOCK = "usaspending";
const KINDS: FileKind[] = ["contracts", "assistance"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Calendar months covering the last `years` years, oldest first, ending with the current month. */
export function backfillMonths(years: number, today = new Date()): { start: string; end: string; key: string }[] {
  const out = [];
  const first = new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), 1));
  for (let d = first; d <= today; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push({ start: iso(d), end: iso(end > today ? today : end), key: iso(d).slice(0, 7) });
  }
  return out;
}

async function downloadAndLoad(
  req: BulkDownloadRequest,
  ctx: ChunkContext,
  availability: AvailabilityMode,
  limit?: number,
  minAwardUsd?: number,
) {
  const fileName = await requestBulkDownload(req);
  ctx.log.info(`requested ${req.kind} ${req.dateType} ${req.startDate}..${req.endDate} -> ${fileName}`);
  const url = await waitForDownload(fileName, ctx.log.info);
  const dir = path.join(os.tmpdir(), "alloqent-usaspending");
  const file = await downloadToFile(url, dir);
  try {
    return await loadUsaspendingFile(file, ctx, { availability, limit, kind: req.kind, minAwardUsd });
  } finally {
    await rm(file, { force: true });
  }
}

export interface BackfillOptions {
  years?: number;
  kinds?: FileKind[];
  /** Only this month, "YYYY-MM". */
  month?: string;
  force?: boolean;
  limit?: number;
  /**
   * "Lite" history: keep only awards whose total obligation is at least this (USD). Uses its own
   * chunk keys, so a later full backfill of the same months still runs.
   */
  minAwardUsd?: number;
  log?: Logger;
}

/**
 * Load prime transactions month by month (by action date). Each kind×month is a chunk;
 * finished chunks are skipped, so re-running resumes after a crash.
 * The current month is never marked complete, so it reloads until the month is over.
 */
export async function usaspendingBackfill(opts: BackfillOptions = {}) {
  const log = opts.log ?? consoleLogger;
  const months = backfillMonths(opts.years ?? dataConfig.backfillYears).filter((m) => !opts.month || m.key === opts.month);
  const currentMonth = iso(new Date()).slice(0, 7);
  let maxLm: string | null = null;

  for (const m of months) {
    for (const kind of opts.kinds ?? KINDS) {
      const isCurrent = m.key === currentMonth;
      const lite = opts.minAwardUsd ? `:min${opts.minAwardUsd}` : "";
      const res = await runChunk(
        {
          job: "usaspending_backfill",
          chunkKey: isCurrent ? `${kind}:${m.key}${lite}:partial:${iso(new Date())}` : `${kind}:${m.key}${lite}`,
          params: { kind, ...m, limit: opts.limit, minAwardUsd: opts.minAwardUsd },
          force: opts.force,
          log,
        },
        async (ctx) => {
          const r = await downloadAndLoad(
            { kind, dateType: "action_date", startDate: m.start, endDate: m.end },
            ctx,
            { kind: "sourceDate" },
            opts.limit,
            opts.minAwardUsd,
          );
          if (r.maxLastModified && (!maxLm || r.maxLastModified > maxLm)) maxLm = r.maxLastModified;
        },
      );
      if (res.status === "succeeded" && maxLm) await markFresh("usaspending", maxLm);
    }
  }
}

/**
 * The daily job's requests: both kinds modified since the last load (minus an overlap window),
 * plus assistance by action date over a fixed lookback (see dataConfig). Overlapping rows are
 * idempotent upserts.
 */
export function dailyRequests(lastThrough: Date | null, today: Date): BulkDownloadRequest[] {
  const from = new Date(lastThrough ?? today);
  from.setUTCDate(from.getUTCDate() - dataConfig.incrementalOverlapDays);
  const assistanceFrom = new Date(today);
  assistanceFrom.setUTCDate(assistanceFrom.getUTCDate() - dataConfig.assistanceDailyLookbackDays);
  return [
    { kind: "contracts", dateType: "last_modified_date", startDate: iso(from), endDate: iso(today) },
    { kind: "assistance", dateType: "last_modified_date", startDate: iso(from), endDate: iso(today) },
    { kind: "assistance", dateType: "action_date", startDate: iso(assistanceFrom), endDate: iso(today) },
  ];
}

/**
 * Daily incremental load. New rows get availableAt = now(), which drives the free-tier delay
 * and alerts; rows already loaded keep theirs and are only updated when their content changed.
 */
export async function usaspendingDaily(opts: { log?: Logger; limit?: number } = {}) {
  const log = opts.log ?? consoleLogger;
  const { rows } = await jobPool().query<{ through: Date }>(
    `SELECT "dataThrough" AS through FROM "DataFreshness" WHERE source = 'usaspending'`,
  );

  for (const req of dailyRequests(rows[0]?.through ?? null, new Date())) {
    let maxLm: string | null = null;
    await runChunk(
      {
        job: "usaspending_daily",
        chunkKey: `${req.kind}:${req.dateType}:${req.startDate}..${req.endDate}`,
        params: { ...req, limit: opts.limit },
        force: true,
        log,
      },
      async (ctx) => {
        const r = await downloadAndLoad(req, ctx, { kind: "now" }, opts.limit);
        maxLm = r.maxLastModified;
      },
    );
    if (maxLm) await markFresh("usaspending", maxLm);
  }
}

/** Load a local zip/CSV (fixtures, or a file downloaded by hand from usaspending.gov). */
export async function usaspendingLoadLocal(
  file: string,
  opts: { kind?: FileKind; limit?: number; incremental?: boolean; minAwardUsd?: number; log?: Logger },
) {
  let maxLm: string | null = null;
  await runChunk(
    {
      job: "usaspending_file",
      chunkKey: path.basename(file),
      params: { file, ...opts, log: undefined },
      force: true,
      attempts: 1,
      log: opts.log,
    },
    async (ctx) => {
      const r = await loadUsaspendingFile(file, ctx, {
        availability: opts.incremental ? { kind: "now" } : { kind: "sourceDate" },
        kind: opts.kind,
        limit: opts.limit,
        minAwardUsd: opts.minAwardUsd,
      });
      maxLm = r.maxLastModified;
    },
  );
  if (maxLm) await markFresh("usaspending", maxLm);
}
