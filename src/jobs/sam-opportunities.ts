import { dataConfig } from "@/config/data";
import { fetchAwardNotices, toAwardNotice, type SamOpportunity } from "@/lib/sources/sam/opportunities";
import { consoleLogger, jobPool, markFresh, runChunk, type Logger } from "./runner";

/** Pages per run; each page is one SAM.gov request counted against the shared daily key quota. */
export const SAM_OPPORTUNITY_PAGES_PER_RUN = 10;

type PageFetcher = (offset: number) => Promise<{ totalRecords: number; opportunitiesData?: SamOpportunity[] }>;

/**
 * Contract award notices posted to SAM.gov in the last week. Awardee UEIs link straight to
 * recipients (UEI is our recipient id), so notices for public companies show up on company
 * pages, often days or weeks before the award reaches USAspending.
 */
export async function samOpportunities(opts: { log?: Logger; fetchPage?: PageFetcher } = {}) {
  const log = opts.log ?? consoleLogger;
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey && !opts.fetchPage) {
    log.info("SAM_API_KEY not set; skipping SAM.gov award notices");
    return;
  }
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - dataConfig.samOpportunities.lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const fetchPage: PageFetcher = opts.fetchPage ?? ((offset) => fetchAwardNotices(apiKey!, from, to, offset));

  await runChunk(
    { job: "sam_opportunities", chunkKey: `${from}..${to}`, params: { from, to }, force: true, attempts: 2, log },
    async ({ client, stats }) => {
      for (let page = 0, offset = 0; page < SAM_OPPORTUNITY_PAGES_PER_RUN; page++) {
        const res = await fetchPage(offset);
        const items = res.opportunitiesData ?? [];
        for (const o of items) {
          stats.rowsRead++;
          const n = toAwardNotice(o);
          if (!n) {
            stats.rowsSkipped++;
            continue;
          }
          const r = await client.query(
            `INSERT INTO "SamAwardNotice" ("noticeId", title, "solicitationNumber", "postedDate", "awardDate", "awardNumber", amount,
                                          "awardeeName", "awardeeUei", "recipientId", department, office, "naicsCode", url, "createdAt")
             VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, (SELECT id FROM "Recipient" WHERE id = $9), $10, $11, $12, $13, now())
             ON CONFLICT ("noticeId") DO UPDATE SET title = EXCLUDED.title, amount = EXCLUDED.amount, "awardeeName" = EXCLUDED."awardeeName",
               "awardeeUei" = EXCLUDED."awardeeUei", "recipientId" = COALESCE(EXCLUDED."recipientId", "SamAwardNotice"."recipientId")`,
            [n.noticeId, n.title, n.solicitationNumber, n.postedDate, n.awardDate, n.awardNumber, n.amount, n.awardeeName,
             n.awardeeUei, n.department, n.office, n.naicsCode, n.url],
          );
          stats.rowsUpserted += r.rowCount ?? 0;
        }
        offset += items.length;
        if (!items.length || offset >= res.totalRecords) break;
      }
      // Notices whose awardee appeared in USAspending since they were loaded.
      await client.query(
        `UPDATE "SamAwardNotice" n SET "recipientId" = r.id FROM "Recipient" r
         WHERE n."recipientId" IS NULL AND n."awardeeUei" = r.id`,
      );
    },
  );
  await markFresh("sam_opportunities", to);
}

/** Requests made by SAM jobs in the last 24h (used to share the key's daily quota). */
export async function samRequestsLast24h(): Promise<number> {
  const { rows } = await jobPool().query<{ parents: string; opps: string }>(
    `SELECT COALESCE(SUM("rowsRead") FILTER (WHERE job = 'sam_parents'), 0) AS parents,
            COUNT(*) FILTER (WHERE job = 'sam_opportunities') AS opps
     FROM "IngestionRun" WHERE job IN ('sam_parents', 'sam_opportunities') AND "startedAt" > now() - interval '24 hours'`,
  );
  return Number(rows[0].parents) + Number(rows[0].opps) * SAM_OPPORTUNITY_PAGES_PER_RUN;
}
