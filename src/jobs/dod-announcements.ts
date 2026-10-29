import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { dataConfig } from "@/config/data";
import { fetchContractsPage, fetchContractsRss } from "@/lib/sources/dod/client";
import { announcementDate, parseContractsPage, parseRss } from "@/lib/sources/dod/parse";
import { HttpError } from "@/lib/sources/http";
import { consoleLogger, markFresh, runChunk, type Logger } from "./runner";

/**
 * Load defense.gov daily contract announcements (same-day, before USAspending) and link each
 * to a recipient: first by contract number (PIID) against loaded awards, else by exact
 * normalized name when exactly one business recipient has it. Company/ticker come from that
 * recipient's ticker match at display time, so review decisions apply automatically.
 */
export async function dodAnnouncements(
  opts: {
    log?: Logger;
    file?: string;
    url?: string;
    date?: string;
    fetchers?: { rss: () => Promise<string>; page: (url: string) => Promise<string> };
  } = {},
) {
  const log = opts.log ?? consoleLogger;
  const fetchers = opts.fetchers ?? { rss: fetchContractsRss, page: fetchContractsPage };
  let blocked = 0;
  await runChunk(
    { job: "dod_announcements", chunkKey: new Date().toISOString(), params: { file: opts.file ?? null }, force: true, attempts: 2, log },
    async ({ client, stats }) => {
      const pages: { url: string; date: string; html: string }[] = [];
      if (opts.file) {
        // Local page (tests / manual backfill of a saved announcement).
        pages.push({ url: opts.url ?? `file://${opts.file}`, date: opts.date ?? new Date().toISOString().slice(0, 10), html: await readFile(opts.file, "utf8") });
      } else {
        const items = parseRss(await fetchers.rss());
        const { rows: seen } = await client.query<{ url: string }>(
          `SELECT DISTINCT url FROM "DodAnnouncement" WHERE url = ANY($1::text[])`,
          [items.map((i) => i.link)],
        );
        const known = new Set(seen.map((r) => r.url));
        for (const item of items) {
          const date = announcementDate(item.title, item.pubDate);
          if (!item.link || !date || known.has(item.link)) continue;
          try {
            pages.push({ url: item.link, date, html: await fetchers.page(item.link) });
          } catch (err) {
            // The site blocks some automated clients (403). Fall back to article HTML embedded in
            // the feed; otherwise skip the day rather than failing the daily run.
            if (!(err instanceof HttpError && (err.status === 401 || err.status === 403))) throw err;
            if (parseContractsPage(item.contentHtml).length) {
              pages.push({ url: item.link, date, html: item.contentHtml });
            } else {
              blocked++;
              log.error(`${item.link} -> ${err.status} (blocked); skipped`);
            }
          }
        }
      }

      for (const page of pages) {
        const contracts = parseContractsPage(page.html);
        stats.rowsRead += contracts.length;
        if (!contracts.length) log.error(`no contracts parsed from ${page.url} (page layout changed?)`);
        for (const c of contracts) {
          const r = await client.query(
            `INSERT INTO "DodAnnouncement" (id, "announcementDate", branch, text, "contractorName", "normalizedName", amount,
                                            "contractNumber", "contractingActivity", url, "createdAt")
             VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, now())
             ON CONFLICT (id) DO NOTHING`,
            [c.id, page.date, c.branch, c.text, c.contractorName, c.normalizedName, c.amount, c.contractNumber, c.contractingActivity, page.url],
          );
          stats.rowsUpserted += r.rowCount ?? 0;
        }
      }
      stats.rowsSkipped = await relink(client);
    },
  );
  // Freshness reflects a complete fetch; blocked days leave "last updated" where it was.
  if (!blocked) await markFresh("dod", new Date().toISOString().slice(0, 10));
  return { blocked };
}

/** Link recent unlinked announcements; returns how many remain unlinked. */
async function relink(client: PoolClient): Promise<number> {
  const since = `${dataConfig.dod.relinkDays} days`;
  // 1) Contract number -> award PIID (USAspending stores PIIDs without dashes).
  await client.query(
    `UPDATE "DodAnnouncement" d SET "recipientId" = a."recipientId"
     FROM "Award" a
     WHERE d."recipientId" IS NULL AND d."contractNumber" IS NOT NULL AND d."announcementDate" > now() - $1::interval
       AND a."displayId" = replace(d."contractNumber", '-', '') AND a."recipientId" IS NOT NULL`,
    [since],
  );
  // 2) Exact normalized name, only when unambiguous.
  await client.query(
    `UPDATE "DodAnnouncement" d SET "recipientId" = r.id
     FROM (SELECT "normalizedName", MIN(id) AS id FROM "Recipient" WHERE "recipientType" IN ('BUSINESS', 'UNKNOWN')
           GROUP BY 1 HAVING COUNT(*) = 1) r
     WHERE d."recipientId" IS NULL AND d."normalizedName" <> '' AND d."announcementDate" > now() - $1::interval
       AND r."normalizedName" = d."normalizedName"`,
    [since],
  );
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) n FROM "DodAnnouncement" WHERE "recipientId" IS NULL AND "announcementDate" > now() - $1::interval`,
    [since],
  );
  return Number(rows[0].n);
}
