import { programs } from "@/config/programs";
import { rulesToSql } from "@/lib/programs/rules";
import { consoleLogger, runChunk, type Logger } from "./runner";

/** Sync Program rows from src/config/programs.ts and rebuild each program's award tags. */
export async function tagPrograms(opts: { log?: Logger } = {}) {
  await runChunk(
    {
      job: "tag_programs",
      chunkKey: new Date().toISOString(),
      params: { programs: programs.map((p) => p.slug) },
      force: true,
      attempts: 2,
      baseDelayMs: 10_000,
      log: opts.log ?? consoleLogger,
    },
    async ({ client, stats, log }) => {
      await client.query("BEGIN");
      try {
        for (const prog of programs) {
          await client.query(
            `INSERT INTO "Program" (slug, name, description, "matchRules", "sourceUrl", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, now(), now())
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
               "matchRules" = EXCLUDED."matchRules", "sourceUrl" = EXCLUDED."sourceUrl", "updatedAt" = now()`,
            [prog.slug, prog.name, prog.description, JSON.stringify(prog.rules), prog.sourceUrl],
          );
          const { sql, params } = rulesToSql(prog.rules, 2);
          await client.query(`DELETE FROM "AwardProgram" WHERE "programSlug" = $1`, [prog.slug]);
          const res = await client.query(
            `INSERT INTO "AwardProgram" ("awardId", "programSlug") SELECT a.id, $1 FROM "Award" a WHERE ${sql}`,
            [prog.slug, ...params],
          );
          stats.rowsUpserted += res.rowCount ?? 0;
          log.info(`program ${prog.slug}: ${res.rowCount} awards`);
        }
        // Programs removed from config lose their tags (the Program row stays for old links).
        await client.query(`DELETE FROM "AwardProgram" WHERE NOT ("programSlug" = ANY($1::text[]))`, [programs.map((p) => p.slug)]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      stats.rowsRead = programs.length;
    },
  );
}
