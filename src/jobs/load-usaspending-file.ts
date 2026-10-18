import { createReadStream } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import { dataConfig } from "@/config/data";
import { fileKindFromName, parseRow, RowError, type FileKind, type ParsedTransaction, type RawRow } from "@/lib/sources/usaspending/rows";
import type { ChunkContext } from "./runner";
import { upsertBatch, type AvailabilityMode } from "./upsert";

export interface LoadOptions {
  availability: AvailabilityMode;
  /** Stop after this many rows (for smoke tests). */
  limit?: number;
  /** Force the file kind for a bare CSV whose name doesn't say. */
  kind?: FileKind;
}

/** Latest last_modified_date seen in the file — becomes DataFreshness.dataThrough. */
export interface LoadResult {
  maxLastModified: string | null;
}

/** Load a USAspending bulk-download zip (or a single extracted CSV) into the database. */
export async function loadUsaspendingFile(file: string, ctx: ChunkContext, opts: LoadOptions): Promise<LoadResult> {
  const result: LoadResult = { maxLastModified: null };
  const entries: { name: string; open: () => Readable }[] = [];

  if (file.toLowerCase().endsWith(".zip")) {
    const dir = await unzipper.Open.file(file);
    for (const f of dir.files) {
      if (f.type === "File" && f.path.toLowerCase().endsWith(".csv")) entries.push({ name: f.path, open: () => f.stream() });
    }
  } else {
    entries.push({ name: path.basename(file), open: () => createReadStream(file) });
  }

  for (const entry of entries) {
    const kind = opts.kind ?? fileKindFromName(entry.name);
    if (!kind) {
      ctx.log.info(`skipping ${entry.name} (not a prime-transactions file)`);
      continue;
    }
    ctx.log.info(`loading ${entry.name} as ${kind}`);
    const done = await loadCsvStream(entry.open(), kind, ctx, opts, result);
    if (done) break;
  }
  return result;
}

/** Returns true when the row limit was reached. */
async function loadCsvStream(
  stream: Readable,
  kind: FileKind,
  ctx: ChunkContext,
  opts: LoadOptions,
  result: LoadResult,
): Promise<boolean> {
  const parser = stream.pipe(parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true }));
  let batch: ParsedTransaction[] = [];
  const flush = async () => {
    if (!batch.length) return;
    ctx.stats.rowsUpserted += await upsertBatch(ctx.client, batch, opts.availability);
    batch = [];
  };

  let errorsLogged = 0;
  for await (const raw of parser as AsyncIterable<RawRow>) {
    ctx.stats.rowsRead++;
    try {
      const parsed = parseRow(kind, raw);
      batch.push(parsed);
      const lm = parsed.transaction.lastModifiedDate;
      if (!result.maxLastModified || lm > result.maxLastModified) result.maxLastModified = lm;
    } catch (err) {
      if (!(err instanceof RowError)) throw err;
      ctx.stats.rowsSkipped++;
      if (errorsLogged++ < 20) ctx.log.error(`row ${ctx.stats.rowsRead}: ${err.message}`);
    }
    if (batch.length >= dataConfig.upsertBatchSize) {
      await flush();
      if (ctx.stats.rowsRead % 100_000 < dataConfig.upsertBatchSize)
        ctx.log.info(`  ${ctx.stats.rowsRead.toLocaleString()} rows read`);
    }
    if (opts.limit && ctx.stats.rowsRead >= opts.limit) {
      await flush();
      stream.destroy();
      return true;
    }
  }
  await flush();
  return false;
}
