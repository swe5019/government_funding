import { mappingConfig } from "@/config/mapping";

/**
 * SQL fragments shared by the jobs (pg) and the app (Prisma raw queries).
 * `tm` must alias "TickerMatch". Mirrors matchDisplay() in ./display.ts.
 */
const T = Number(mappingConfig.confidenceThreshold);

export const CONFIRMED_SQL = `(tm."companyCik" IS NOT NULL AND (tm.status IN ('APPROVED', 'CORRECTED')
  OR (tm.status = 'PENDING' AND tm.confidence >= ${T})))`;

export const POSSIBLE_SQL = `(tm."companyCik" IS NOT NULL AND tm.status = 'PENDING' AND tm.confidence < ${T})`;

/** Clear CompanyAwardMonthly. $1 = CIKs (text[]) or NULL for all. */
export const COMPANY_ROLLUP_DELETE = `DELETE FROM "CompanyAwardMonthly" WHERE $1::text[] IS NULL OR "companyCik" = ANY($1::text[])`;

/**
 * Rebuild CompanyAwardMonthly. $1 = DELAYED-view cutoff (timestamptz), $2 = CIKs to rebuild
 * (text[]) or NULL for all. Rows: per month × (all | per agency | per category), each for
 * confirmed-only and confirmed+possible.
 */
export const COMPANY_ROLLUP_INSERT = `
  INSERT INTO "CompanyAwardMonthly" ("companyCik", view, month, "agencyCode", category, "includesPossible", obligated, "txCount")
  SELECT x.cik, x.view::"DataView", x.month,
         CASE WHEN GROUPING(x.agency) = 1 THEN 'ALL' ELSE x.agency END,
         CASE WHEN GROUPING(x.category) = 1 THEN 'ALL' ELSE x.category END,
         x.includes_possible, SUM(x.obligation), COUNT(*)
  FROM (
    SELECT tm."companyCik" AS cik, v.view, date_trunc('month', t."actionDate")::date AS month,
           COALESCE(a."awardingAgencyCode", 'UNKNOWN') AS agency, a.category::text AS category,
           p.includes_possible, t.obligation
    FROM "TickerMatch" tm
    JOIN "Award" a ON a."recipientId" = tm."recipientId"
    JOIN "AwardTransaction" t ON t."awardId" = a.id
    CROSS JOIN (VALUES ('REALTIME'), ('DELAYED')) AS v(view)
    CROSS JOIN (VALUES (false), (true)) AS p(includes_possible)
    WHERE (${CONFIRMED_SQL} OR (p.includes_possible AND ${POSSIBLE_SQL}))
      AND (v.view = 'REALTIME' OR t."availableAt" <= $1::timestamptz)
      AND ($2::text[] IS NULL OR tm."companyCik" = ANY($2::text[]))
  ) x
  GROUP BY GROUPING SETS (
    (x.cik, x.view, x.includes_possible, x.month),
    (x.cik, x.view, x.includes_possible, x.month, x.agency),
    (x.cik, x.view, x.includes_possible, x.month, x.category)
  )`;
