import { jobPool, type Logger, consoleLogger } from "./runner";

/**
 * Read-only storage report: database size, the largest tables (with indexes), and how awards
 * and transactions split by award size. Used to plan what fits a free database.
 */
export async function dbStats(opts: { log?: Logger } = {}) {
  const log = opts.log ?? consoleLogger;
  const q = async <T>(sql: string) => (await jobPool().query(sql)).rows as T[];

  const [{ size }] = await q<{ size: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
  log.info(`database size: ${size}`);

  const tables = await q<{ name: string; total: string; data: string; indexes: string; rows: string }>(
    `SELECT c.relname AS name,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
            pg_size_pretty(pg_relation_size(c.oid)) AS data,
            pg_size_pretty(pg_indexes_size(c.oid)) AS indexes,
            c.reltuples::bigint::text AS rows
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 12`,
  );
  log.info("largest tables (total = data + indexes, rows estimated):");
  for (const t of tables) log.info(`  ${t.name.padEnd(28)} ${t.total.padStart(9)}  data ${t.data.padStart(9)}  idx ${t.indexes.padStart(9)}  ~${t.rows} rows`);

  const buckets = await q<{ bucket: string; kind: string; awards: string; txs: string }>(
    `SELECT CASE WHEN abs(a."totalObligated") < 100000 THEN '1: < $100K'
                 WHEN abs(a."totalObligated") < 1000000 THEN '2: $100K-1M'
                 WHEN abs(a."totalObligated") < 10000000 THEN '3: $1M-10M'
                 ELSE '4: >= $10M' END AS bucket,
            CASE WHEN a.category IN ('CONTRACT', 'IDV') THEN 'contracts' ELSE 'assistance' END AS kind,
            count(DISTINCT a.id)::text AS awards, count(t.id)::text AS txs
     FROM "Award" a LEFT JOIN "AwardTransaction" t ON t."awardId" = a.id
     GROUP BY 1, 2 ORDER BY 2, 1`,
  );
  log.info("awards and transactions by award size:");
  for (const b of buckets) log.info(`  ${b.kind.padEnd(10)} ${b.bucket.padEnd(14)} awards ${b.awards.padStart(9)}  transactions ${b.txs.padStart(9)}`);

  const [span] = await q<{ first: string; last: string }>(
    `SELECT min("actionDate")::text AS first, max("actionDate")::text AS last FROM "AwardTransaction"`,
  );
  log.info(`transaction action dates: ${span.first} .. ${span.last}`);
}
