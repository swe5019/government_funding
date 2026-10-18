import type { PoolClient } from "pg";
import type { ParsedTransaction } from "@/lib/sources/usaspending/rows";

/**
 * Idempotent bulk upserts for USAspending rows. Each statement takes one array per column
 * and UNNESTs them, so a 2,000-row batch is a handful of round trips. Re-loading the
 * same file changes nothing; newer source versions (by last_modified_date) win.
 */

export type AvailabilityMode =
  /** Backfill: treat the source's last-modified date as the publication time. */
  | { kind: "sourceDate" }
  /** Incremental: the record became available when we first saw it. */
  | { kind: "now" };

/** Keep the newest version of each key within a batch (ON CONFLICT can't touch a row twice). */
function dedupe<T>(items: T[], key: (t: T) => string, newer: (a: T, b: T) => boolean): T[] {
  const map = new Map<string, T>();
  for (const it of items) {
    const k = key(it);
    const prev = map.get(k);
    if (!prev || newer(it, prev)) map.set(k, it);
  }
  return [...map.values()];
}

const col = <T, V>(rows: T[], f: (r: T) => V) => rows.map(f);

export async function upsertBatch(
  client: PoolClient,
  rows: ParsedTransaction[],
  availability: AvailabilityMode,
): Promise<number> {
  if (rows.length === 0) return 0;
  const byModified = (a: { lastModifiedDate: string }, b: { lastModifiedDate: string }) =>
    a.lastModifiedDate >= b.lastModifiedDate;

  const agencies = dedupe(rows.flatMap((r) => r.agencies), (a) => a.code, () => true);
  const subs = dedupe(rows.flatMap((r) => r.subAgencies), (a) => a.code, () => true);
  const recipients = dedupe(
    rows.map((r) => ({ ...r.recipient, lastModifiedDate: r.award.lastModifiedDate })),
    (r) => r.id,
    byModified,
  );
  const awards = dedupe(rows.map((r) => r.award), (a) => a.id, byModified);
  const txs = dedupe(rows.map((r) => r.transaction), (t) => t.id, byModified);

  await client.query("BEGIN");
  try {
    if (agencies.length) {
      await client.query(
        `INSERT INTO "Agency" (code, name, "updatedAt")
         SELECT * , now() FROM unnest($1::text[], $2::text[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()
         WHERE "Agency".name IS DISTINCT FROM EXCLUDED.name`,
        [col(agencies, (a) => a.code), col(agencies, (a) => a.name)],
      );
    }
    if (subs.length) {
      await client.query(
        `INSERT INTO "SubAgency" (code, name, "agencyCode", "updatedAt")
         SELECT *, now() FROM unnest($1::text[], $2::text[], $3::text[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "agencyCode" = EXCLUDED."agencyCode", "updatedAt" = now()
         WHERE ("SubAgency".name, "SubAgency"."agencyCode") IS DISTINCT FROM (EXCLUDED.name, EXCLUDED."agencyCode")`,
        [col(subs, (a) => a.code), col(subs, (a) => a.name), col(subs, (a) => a.agencyCode)],
      );
    }

    await client.query(
      `INSERT INTO "Recipient" (id, uei, duns, name, "normalizedName", "parentUei", "parentName",
                                "recipientType", "stateCode", "countryCode", "createdAt", "updatedAt")
       SELECT *, now(), now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                                          $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         "normalizedName" = EXCLUDED."normalizedName",
         duns = COALESCE(EXCLUDED.duns, "Recipient".duns),
         "parentUei" = COALESCE(EXCLUDED."parentUei", "Recipient"."parentUei"),
         "parentName" = COALESCE(EXCLUDED."parentName", "Recipient"."parentName"),
         "recipientType" = CASE WHEN EXCLUDED."recipientType" = 'UNKNOWN' THEN "Recipient"."recipientType"
                                ELSE EXCLUDED."recipientType" END,
         "stateCode" = COALESCE(EXCLUDED."stateCode", "Recipient"."stateCode"),
         "countryCode" = COALESCE(EXCLUDED."countryCode", "Recipient"."countryCode"),
         "updatedAt" = now()
       WHERE ("Recipient".name, "Recipient"."parentUei", "Recipient"."recipientType", "Recipient"."stateCode")
             IS DISTINCT FROM
             (EXCLUDED.name, COALESCE(EXCLUDED."parentUei", "Recipient"."parentUei"),
              CASE WHEN EXCLUDED."recipientType" = 'UNKNOWN' THEN "Recipient"."recipientType" ELSE EXCLUDED."recipientType" END,
              COALESCE(EXCLUDED."stateCode", "Recipient"."stateCode"))`,
      [
        col(recipients, (r) => r.id),
        col(recipients, (r) => r.uei),
        col(recipients, (r) => r.duns),
        col(recipients, (r) => r.name),
        col(recipients, (r) => r.normalizedName),
        col(recipients, (r) => r.parentUei),
        col(recipients, (r) => r.parentName),
        col(recipients, (r) => r.recipientType),
        col(recipients, (r) => r.stateCode),
        col(recipients, (r) => r.countryCode),
      ],
    );

    // defCodes is text[] per row; pass as a JSON array of arrays and expand.
    await client.query(
      `INSERT INTO "Award" (id, source, "displayId", category, "typeCode", description, "recipientId",
                            "awardingAgencyCode", "awardingSubCode", "fundingAgencyCode", "naicsCode", "pscCode",
                            "assistanceListing", "defCodes", "totalObligated", "potentialValue",
                            "startDate", "endDate", "lastModifiedDate", "sourceUrl", "createdAt", "updatedAt")
       SELECT u.id, 'USASPENDING', u.display_id, u.category::"AwardCategory", u.type_code, u.description, u.recipient_id,
              u.awarding, u.awarding_sub, u.funding, u.naics, u.psc, u.listing,
              ARRAY(SELECT jsonb_array_elements_text(u.def_codes)),
              u.total, u.potential, u.start_date, u.end_date, u.last_modified, u.source_url, now(), now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                   $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::jsonb[],
                   $14::numeric[], $15::numeric[], $16::date[], $17::date[], $18::date[], $19::text[])
         AS u(id, display_id, category, type_code, description, recipient_id, awarding, awarding_sub,
              funding, naics, psc, listing, def_codes, total, potential, start_date, end_date,
              last_modified, source_url)
       ON CONFLICT (id) DO UPDATE SET
         "displayId" = EXCLUDED."displayId", category = EXCLUDED.category, "typeCode" = EXCLUDED."typeCode",
         description = EXCLUDED.description, "recipientId" = EXCLUDED."recipientId",
         "awardingAgencyCode" = EXCLUDED."awardingAgencyCode", "awardingSubCode" = EXCLUDED."awardingSubCode",
         "fundingAgencyCode" = EXCLUDED."fundingAgencyCode", "naicsCode" = EXCLUDED."naicsCode",
         "pscCode" = EXCLUDED."pscCode", "assistanceListing" = EXCLUDED."assistanceListing",
         "defCodes" = EXCLUDED."defCodes", "totalObligated" = EXCLUDED."totalObligated",
         "potentialValue" = EXCLUDED."potentialValue", "startDate" = EXCLUDED."startDate",
         "endDate" = EXCLUDED."endDate", "lastModifiedDate" = EXCLUDED."lastModifiedDate",
         "sourceUrl" = EXCLUDED."sourceUrl", "updatedAt" = now()
       WHERE EXCLUDED."lastModifiedDate" >= "Award"."lastModifiedDate"
         AND ("Award"."totalObligated", "Award"."recipientId", "Award"."lastModifiedDate", "Award"."endDate",
              "Award"."potentialValue", "Award".description)
             IS DISTINCT FROM
             (EXCLUDED."totalObligated", EXCLUDED."recipientId", EXCLUDED."lastModifiedDate", EXCLUDED."endDate",
              EXCLUDED."potentialValue", EXCLUDED.description)`,
      [
        col(awards, (a) => a.id),
        col(awards, (a) => a.displayId),
        col(awards, (a) => a.category),
        col(awards, (a) => a.typeCode),
        col(awards, (a) => a.description),
        col(awards, (a) => a.recipientId),
        col(awards, (a) => a.awardingAgencyCode),
        col(awards, (a) => a.awardingSubCode),
        col(awards, (a) => a.fundingAgencyCode),
        col(awards, (a) => a.naicsCode),
        col(awards, (a) => a.pscCode),
        col(awards, (a) => a.assistanceListing),
        col(awards, (a) => JSON.stringify(a.defCodes)),
        col(awards, (a) => a.totalObligated),
        col(awards, (a) => a.potentialValue),
        col(awards, (a) => a.startDate),
        col(awards, (a) => a.endDate),
        col(awards, (a) => a.lastModifiedDate),
        col(awards, (a) => a.sourceUrl),
      ],
    );

    const availableExpr =
      availability.kind === "now" ? "now()" : `(u.last_modified::timestamp AT TIME ZONE 'UTC')`;
    const res = await client.query(
      `INSERT INTO "AwardTransaction" (id, "awardId", "modNumber", "actionDate", obligation, "actionType",
                                       description, "availableAt", "lastModifiedDate", "updatedAt")
       SELECT u.id, u.award_id, u.mod, u.action_date, u.obligation, u.action_type, u.description,
              ${availableExpr}, u.last_modified, now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::numeric[], $6::text[], $7::text[], $8::date[])
         AS u(id, award_id, mod, action_date, obligation, action_type, description, last_modified)
       ON CONFLICT (id) DO UPDATE SET
         "modNumber" = EXCLUDED."modNumber", "actionDate" = EXCLUDED."actionDate",
         obligation = EXCLUDED.obligation, "actionType" = EXCLUDED."actionType",
         description = EXCLUDED.description, "lastModifiedDate" = EXCLUDED."lastModifiedDate",
         "updatedAt" = now()
       WHERE EXCLUDED."lastModifiedDate" >= "AwardTransaction"."lastModifiedDate"
         AND ("AwardTransaction"."actionDate", "AwardTransaction".obligation, "AwardTransaction"."actionType",
              "AwardTransaction".description)
             IS DISTINCT FROM
             (EXCLUDED."actionDate", EXCLUDED.obligation, EXCLUDED."actionType", EXCLUDED.description)`,
      [
        col(txs, (t) => t.id),
        col(txs, (t) => t.awardId),
        col(txs, (t) => t.modNumber),
        col(txs, (t) => t.actionDate),
        col(txs, (t) => t.obligation),
        col(txs, (t) => t.actionType),
        col(txs, (t) => t.description),
        col(txs, (t) => t.lastModifiedDate),
      ],
    );

    await client.query("COMMIT");
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
