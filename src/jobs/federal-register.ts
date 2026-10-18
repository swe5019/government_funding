import { dataConfig } from "@/config/data";
import { programs } from "@/config/programs";
import { searchDocuments, type FrDocument } from "@/lib/sources/fedreg/client";
import { consoleLogger, markFresh, runChunk, type Logger } from "./runner";

type Fetcher = Parameters<typeof searchDocuments>[2];

/** Rules and notices for each configured program, shown on program pages. */
export async function federalRegister(opts: { log?: Logger; since?: string; fetchPage?: Fetcher } = {}) {
  const since =
    opts.since ?? new Date(Date.now() - dataConfig.federalRegister.lookbackDays * 86_400_000).toISOString().slice(0, 10);
  await runChunk(
    { job: "federal_register", chunkKey: `${since}..`, params: { since }, force: true, attempts: 2, log: opts.log ?? consoleLogger },
    async ({ client, stats, log }) => {
      for (const prog of programs) {
        if (!prog.federalRegister) continue;
        // Program rows normally come from tag-programs; make sure the FK target exists either way.
        await client.query(
          `INSERT INTO "Program" (slug, name, description, "matchRules", "sourceUrl", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, now(), now()) ON CONFLICT (slug) DO NOTHING`,
          [prog.slug, prog.name, prog.description, JSON.stringify(prog.rules), prog.sourceUrl],
        );
        const docs: FrDocument[] = await searchDocuments(prog.federalRegister, since, opts.fetchPage);
        stats.rowsRead += docs.length;
        for (const d of docs) {
          const r = await client.query(
            `INSERT INTO "FederalRegisterDoc" ("documentNumber", "programSlug", title, type, abstract, "agencyNames", "publishedAt", url)
             VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
             ON CONFLICT ("documentNumber", "programSlug") DO UPDATE SET title = EXCLUDED.title, type = EXCLUDED.type,
               abstract = EXCLUDED.abstract, "agencyNames" = EXCLUDED."agencyNames", url = EXCLUDED.url`,
            [
              d.document_number,
              prog.slug,
              d.title,
              d.type,
              d.abstract,
              d.agencies.map((a) => a.name ?? a.raw_name ?? "").filter(Boolean),
              d.publication_date,
              d.html_url,
            ],
          );
          stats.rowsUpserted += r.rowCount ?? 0;
        }
        log.info(`federal register ${prog.slug}: ${docs.length} documents`);
      }
    },
  );
  await markFresh("federal_register", new Date().toISOString().slice(0, 10));
}
