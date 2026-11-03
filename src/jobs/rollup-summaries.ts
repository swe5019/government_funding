import { plans, type PlanKey } from "@/config/plans";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";
import { consoleLogger, runChunk, type Logger } from "./runner";

const FAR_PAST = new Date(Date.UTC(1900, 0, 1));
const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

/**
 * Rebuild per-plan headline totals for the programs/themes list and for every official
 * assistance program (the grant program directory). Each plan's rows apply that plan's data
 * window (free: delayed, limited history), so a list never shows data the viewer's plan
 * doesn't include. Run after tagging and matching.
 */
export async function rollupSummaries(opts: { log?: Logger; now?: Date } = {}) {
  await runChunk(
    { job: "rollup_summaries", chunkKey: "full", params: {}, force: true, attempts: 2, baseDelayMs: 10_000, log: opts.log ?? consoleLogger },
    async ({ client, stats }) => {
      await client.query("BEGIN");
      try {
        // Programs seen on awards before titles were captured still get a directory entry.
        await client.query(
          `INSERT INTO "AssistanceListing" (number, "updatedAt")
           SELECT DISTINCT "assistanceListing", now() FROM "Award" WHERE "assistanceListing" IS NOT NULL
           ON CONFLICT DO NOTHING`,
        );
        await client.query(`DELETE FROM "AssistanceListingSummary"`);
        await client.query(`DELETE FROM "ProgramSummary"`);
        for (const key of Object.keys(plans) as PlanKey[]) {
          const win = dataWindow(plans[key].entitlements, opts.now);
          const window = [key, win.historyStart ?? FAR_PAST, win.availableBefore ?? FAR_FUTURE];
          const p = await client.query(
            `INSERT INTO "ProgramSummary" ("programSlug", plan, total, "publicCompanies")
             SELECT pr.slug, $1, COALESCE(SUM(t.obligation), 0),
                    COUNT(DISTINCT tm."companyCik") FILTER (WHERE ${CONFIRMED_SQL})
             FROM "Program" pr
             LEFT JOIN "AwardProgram" ap ON ap."programSlug" = pr.slug
             LEFT JOIN "AwardTransaction" t ON t."awardId" = ap."awardId" AND t."actionDate" >= $2::date AND t."availableAt" <= $3
             LEFT JOIN "Award" a ON a.id = t."awardId"
             LEFT JOIN "TickerMatch" tm ON tm."recipientId" = a."recipientId"
             GROUP BY pr.slug`,
            window,
          );
          stats.rowsUpserted += p.rowCount ?? 0;
          const r = await client.query(
            `INSERT INTO "AssistanceListingSummary"
               (number, plan, total, "publicTotal", awards, recipients, "publicCompanies", "latestAction", "agencyCode")
             SELECT a."assistanceListing", $1,
                    SUM(t.obligation),
                    COALESCE(SUM(t.obligation) FILTER (WHERE ${CONFIRMED_SQL}), 0),
                    COUNT(DISTINCT a.id), COUNT(DISTINCT a."recipientId"),
                    COUNT(DISTINCT tm."companyCik") FILTER (WHERE ${CONFIRMED_SQL}),
                    MAX(t."actionDate"),
                    mode() WITHIN GROUP (ORDER BY a."awardingAgencyCode")
             FROM "Award" a
             JOIN "AwardTransaction" t ON t."awardId" = a.id
             LEFT JOIN "TickerMatch" tm ON tm."recipientId" = a."recipientId"
             WHERE a."assistanceListing" IS NOT NULL AND t."actionDate" >= $2::date AND t."availableAt" <= $3
             GROUP BY a."assistanceListing"`,
            window,
          );
          stats.rowsUpserted += r.rowCount ?? 0;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
  );
}
