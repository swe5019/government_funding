import { fetchToptierAgencies } from "@/lib/sources/usaspending/client";
import { consoleLogger, runChunk, type Logger } from "./runner";

/** Refresh agency names and abbreviations (so "NASA" or "DOD" finds the agency). */
export async function syncAgencies(opts: { log?: Logger } = {}) {
  await runChunk(
    { job: "usaspending_agencies", chunkKey: new Date().toISOString().slice(0, 10), params: {}, force: true, log: opts.log ?? consoleLogger },
    async ({ client, stats }) => {
      const agencies = await fetchToptierAgencies();
      stats.rowsRead = agencies.length;
      const res = await client.query(
        `INSERT INTO "Agency" (code, name, abbreviation, "updatedAt")
         SELECT *, now() FROM unnest($1::text[], $2::text[], $3::text[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation, "updatedAt" = now()
         WHERE ("Agency".name, "Agency".abbreviation) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.abbreviation)`,
        [agencies.map((a) => a.toptier_code), agencies.map((a) => a.agency_name), agencies.map((a) => a.abbreviation || null)],
      );
      stats.rowsUpserted = res.rowCount ?? 0;
    },
  );
}
