import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { retry } from "@/lib/retry";

/**
 * Shared job plumbing:
 * - every attempt is logged to "IngestionRun" (RUNNING -> SUCCEEDED | FAILED)
 * - a Postgres advisory lock per lock name prevents overlapping runs
 * - each chunk is retried with exponential backoff
 * - chunks that already SUCCEEDED are skipped, so a crashed backfill resumes where it stopped
 *
 * Jobs must connect with the direct (non-pooled) URL: session advisory locks do not survive
 * PgBouncer transaction pooling (Neon "-pooler" hosts).
 */

let pool: Pool | undefined;

export function jobPool(): Pool {
  pool ??= new Pool({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    max: 4,
  });
  return pool;
}

export async function closeJobPool() {
  await pool?.end();
  pool = undefined;
}

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
}

export const consoleLogger: Logger = {
  info: (m) => console.log(`[${new Date().toISOString()}] ${m}`),
  error: (m) => console.error(`[${new Date().toISOString()}] ERROR ${m}`),
};

function lockId(name: string): string {
  // pg advisory locks take a bigint; derive a stable one from the name.
  return BigInt.asIntN(64, BigInt("0x" + createHash("sha1").update(name).digest("hex").slice(0, 16))).toString();
}

/** Hold a session-level advisory lock for the duration of fn, or throw if another run holds it. */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const client = await jobPool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS ok", [
      lockId(name),
    ]);
    if (!rows[0].ok) throw new Error(`another "${name}" job is already running`);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockId(name)]);
    }
  } finally {
    client.release();
  }
}

export interface ChunkStats {
  rowsRead: number;
  rowsUpserted: number;
  rowsSkipped: number;
}

export interface ChunkContext {
  client: PoolClient;
  log: Logger;
  attempt: number;
  stats: ChunkStats;
}

export async function chunkSucceeded(job: string, chunkKey: string): Promise<boolean> {
  const { rows } = await jobPool().query(
    `SELECT 1 FROM "IngestionRun" WHERE job = $1 AND "chunkKey" = $2 AND status = 'SUCCEEDED' LIMIT 1`,
    [job, chunkKey],
  );
  return rows.length > 0;
}

export interface RunChunkOptions {
  job: string;
  chunkKey: string;
  params: Record<string, unknown>;
  /** Re-run even if a previous attempt succeeded. */
  force?: boolean;
  attempts?: number;
  baseDelayMs?: number;
  log?: Logger;
}

export type ChunkResult = { status: "skipped" } | { status: "succeeded"; stats: ChunkStats; runId: string };

/** Run one unit of work with logging + retries. Throws after the final failed attempt. */
export async function runChunk(
  opts: RunChunkOptions,
  work: (ctx: ChunkContext) => Promise<void>,
): Promise<ChunkResult> {
  const log = opts.log ?? consoleLogger;
  if (!opts.force && (await chunkSucceeded(opts.job, opts.chunkKey))) {
    log.info(`${opts.job} ${opts.chunkKey}: already loaded, skipping`);
    return { status: "skipped" };
  }

  return retry(
    async (attempt) => {
      const db = jobPool();
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO "IngestionRun" (id, job, "chunkKey", params, status, attempt, "startedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, 'RUNNING', $4, now()) RETURNING id`,
        [opts.job, opts.chunkKey, JSON.stringify(opts.params), attempt],
      );
      const runId = rows[0].id;
      const stats: ChunkStats = { rowsRead: 0, rowsUpserted: 0, rowsSkipped: 0 };
      const client = await db.connect();
      try {
        log.info(`${opts.job} ${opts.chunkKey}: attempt ${attempt} started (run ${runId})`);
        await work({ client, log, attempt, stats });
        await db.query(
          `UPDATE "IngestionRun" SET status = 'SUCCEEDED', "finishedAt" = now(),
             "rowsRead" = $2, "rowsUpserted" = $3, "rowsSkipped" = $4 WHERE id = $1`,
          [runId, stats.rowsRead, stats.rowsUpserted, stats.rowsSkipped],
        );
        log.info(
          `${opts.job} ${opts.chunkKey}: done — read ${stats.rowsRead}, upserted ${stats.rowsUpserted}, skipped ${stats.rowsSkipped}`,
        );
        return { status: "succeeded" as const, stats, runId };
      } catch (err) {
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        await db.query(
          `UPDATE "IngestionRun" SET status = 'FAILED', "finishedAt" = now(),
             "rowsRead" = $2, "rowsUpserted" = $3, "rowsSkipped" = $4, error = $5 WHERE id = $1`,
          [runId, stats.rowsRead, stats.rowsUpserted, stats.rowsSkipped, msg.slice(0, 8000)],
        );
        log.error(`${opts.job} ${opts.chunkKey}: attempt ${attempt} failed: ${err instanceof Error ? err.message : msg}`);
        throw err;
      } finally {
        client.release();
      }
    },
    { attempts: opts.attempts ?? 3, baseDelayMs: opts.baseDelayMs ?? 30_000 },
  );
}

/** Record that a source has been refreshed (shown as "last updated" in the UI). */
export async function markFresh(source: string, dataThrough: string) {
  await jobPool().query(
    `INSERT INTO "DataFreshness" (source, "lastSuccessfulAt", "dataThrough") VALUES ($1, now(), $2::date)
     ON CONFLICT (source) DO UPDATE SET "lastSuccessfulAt" = now(),
       "dataThrough" = GREATEST("DataFreshness"."dataThrough", EXCLUDED."dataThrough")`,
    [source, dataThrough],
  );
}
