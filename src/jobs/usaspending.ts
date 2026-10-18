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

async function downloadAndLoad(req: BulkDownloadRequest, ctx: ChunkContext, availability: AvailabilityMode, limit?: number) {
  const fileName = await requestBulkDownload(req);
  ctx.log.info(`requested ${req.kind} ${req.dateType} ${req.startDate}..${req.endDate} -> ${fileName}`);
  const url = await waitForDownload(fileName, ctx.log.info);
  const dir = path.join(os.tmpdir(), "fedflow-usaspending");
  const file = await downloadToFile(url, dir);
  try {
    return await loadUsaspendingFile(file, ctx, { availability, limit, kind: req.kind });
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
      const res = await runChunk(
        {
          job: "usaspending_backfill",
          chunkKey: isCurrent ? `${kind}:${m.key}:partial:${iso(new Date())}` : `${kind}:${m.key}`,
          params: { kind, ...m, limit: opts.limit },
          force: opts.force,
          log,
        },
        async (ctx) => {
          const r = await downloadAndLoad(
            { kind, dateType: "action_date", startDate: m.start, endDate: m.end },
            ctx,
            { kind: "sourceDate" },
            opts.limit,
          );
          if (r.maxLastModified && (!maxLm || r.maxLastModified > maxLm)) maxLm = r.maxLastModified;
        },
      );
      if (res.status === "succeeded" && maxLm) await markFresh("usaspending", maxLm);
    }
  }
}

/**
 * Daily incremental: everything modified since the last load (minus an overlap window to catch
 * late-arriving edits). New rows get availableAt = now(), which drives the free-tier delay and alerts.
 */
export async function usaspendingDaily(opts: { log?: Logger; limit?: number } = {}) {
  const log = opts.log ?? consoleLogger;
  const { rows } = await jobPool().query<{ through: Date }>(
    `SELECT "dataThrough" AS through FROM "DataFreshness" WHERE source = 'usaspending'`,
  );
  const today = new Date();
  const from = new Date(rows[0]?.through ?? today);
  from.setUTCDate(from.getUTCDate() - dataConfig.incrementalOverlapDays);
  const range = { startDate: iso(from), endDate: iso(today) };

  for (const kind of KINDS) {
    let maxLm: string | null = null;
    await runChunk(
      {
        job: "usaspending_daily",
        chunkKey: `${kind}:${range.startDate}..${range.endDate}`,
        params: { kind, ...range, limit: opts.limit },
        force: true,
        log,
      },
      async (ctx) => {
        const r = await downloadAndLoad({ kind, dateType: "last_modified_date", ...range }, ctx, { kind: "now" }, opts.limit);
        maxLm = r.maxLastModified;
      },
    );
    if (maxLm) await markFresh("usaspending", maxLm);
  }
}

/** Load a local zip/CSV (fixtures, or a file downloaded by hand from usaspending.gov). */
export async function usaspendingLoadLocal(file: string, opts: { kind?: FileKind; limit?: number; incremental?: boolean; log?: Logger }) {
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
      });
      maxLm = r.maxLastModified;
    },
  );
  if (maxLm) await markFresh("usaspending", maxLm);
}
