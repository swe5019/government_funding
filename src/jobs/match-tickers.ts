import type { PoolClient } from "pg";
import { mappingConfig } from "@/config/mapping";
import { normalizeName } from "@/lib/mapping/normalize";
import { missingParents, MAX_DEPTH, resolveRoot, type RecipientNode, type Root } from "@/lib/mapping/rollup";
import { decide, inheritedConfidence, type Candidate, type MatchDecision } from "@/lib/mapping/score";
import { consoleLogger, jobPool, runChunk, type Logger } from "./runner";

/**
 * Recipient -> public company matching.
 *
 * 1. Pick eligible recipients (business/unknown, >= minObligationUsd net obligated).
 * 2. Roll each up to its root parent; match the root's name against major-exchange companies
 *    and their former names (pg_trgm candidates, scored in src/lib/mapping/score.ts).
 * 3. Subsidiaries inherit the root's match at a slightly lower confidence.
 * 4. Human decisions win: rows a reviewer touched (APPROVED / REJECTED / CORRECTED / MANUAL) are
 *    never rewritten, and a reviewed root's decision flows down to its subsidiaries.
 */

interface Eligible extends RecipientNode {
  recipientType: string;
  total: string;
}

interface ExistingMatch {
  recipientId: string;
  companyCik: string | null;
  status: string;
  method: string;
  confidence: number;
}

interface DesiredMatch {
  recipientId: string;
  companyCik: string;
  confidence: number;
  method: "EXACT_NAME" | "ALIAS" | "FUZZY" | "UEI_PARENT_ROLLUP";
  parentRecipientId: string;
  obligationAtStake: string;
  evidence: unknown;
}

const BATCH = 500;
const REVIEWED = new Set(["APPROVED", "REJECTED", "CORRECTED"]);
const isHumanDecision = (m: ExistingMatch) => REVIEWED.has(m.status) || m.method === "MANUAL";

async function loadEligible(client: PoolClient, since: Date | null): Promise<Eligible[]> {
  const { rows } = await client.query<Eligible>(
    `SELECT r.id, r.name, r."parentUei", r."parentName", r."ultimateParentUei", r."recipientType", m.total::text AS total
     FROM "Recipient" r
     JOIN (SELECT "recipientId", SUM(obligated) AS total FROM "RecipientAwardMonthly"
           WHERE view = 'REALTIME' GROUP BY 1) m ON m."recipientId" = r.id
     WHERE r."recipientType" IN ('BUSINESS', 'UNKNOWN') AND m.total >= $1
       AND ($2::timestamptz IS NULL OR r."updatedAt" >= $2
            OR NOT EXISTS (SELECT 1 FROM "TickerMatch" tm WHERE tm."recipientId" = r.id))`,
    [mappingConfig.minObligationUsd, since],
  );
  return rows;
}

async function loadNodes(client: PoolClient, start: Eligible[]): Promise<Map<string, RecipientNode>> {
  const nodes = new Map<string, RecipientNode>(start.map((r) => [r.id, r]));
  for (let i = 0; i < MAX_DEPTH; i++) {
    const missing = missingParents(nodes);
    if (!missing.length) break;
    const { rows } = await client.query<RecipientNode>(
      `SELECT id, name, "parentUei", "parentName", "ultimateParentUei" FROM "Recipient" WHERE id = ANY($1::text[])`,
      [missing],
    );
    if (!rows.length) break;
    for (const r of rows) nodes.set(r.id, r);
  }
  return nodes;
}

/**
 * Candidate companies for each normalized name: trigram-similar names/former names, or a
 * multi-word company name that prefixes the recipient's ("LOCKHEED MARTIN" in "LOCKHEED MARTIN
 * SPACE"). One-word prefixes are too generic ("TARGET" in "TARGET LOGISTICS").
 */
async function findCandidates(client: PoolClient, names: string[]): Promise<Map<string, Candidate[]>> {
  const out = new Map<string, Candidate[]>();
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const { rows } = await client.query<Candidate & { q: string }>(
      `SELECT q.name AS q, c.cik, c.ticker, c.name AS "companyName", c.matched AS "matchedName", c.source,
              similarity(c.matched, q.name)::float AS similarity
       FROM unnest($1::text[]) AS q(name)
       CROSS JOIN LATERAL (
         (SELECT cik, ticker, name, "normalizedName" AS matched, 'NAME' AS source FROM "Company"
          WHERE "isMajorExchange" AND ("normalizedName" % q.name OR (q.name LIKE "normalizedName" || ' %' AND "normalizedName" LIKE '% %'))
          ORDER BY similarity("normalizedName", q.name) DESC LIMIT 5)
         UNION ALL
         (SELECT co.cik, co.ticker, co.name, a.normalized, 'FORMER_NAME' FROM "CompanyAlias" a
          JOIN "Company" co ON co.cik = a."companyCik"
          WHERE co."isMajorExchange" AND (a.normalized % q.name OR (q.name LIKE a.normalized || ' %' AND a.normalized LIKE '% %'))
          ORDER BY similarity(a.normalized, q.name) DESC LIMIT 5)
       ) c`,
      [batch],
    );
    for (const r of rows) {
      const { q, ...cand } = r;
      const list = out.get(q) ?? [];
      list.push(cand);
      out.set(q, list);
    }
  }
  return out;
}

export async function matchTickers(opts: { full?: boolean; log?: Logger } = {}) {
  const log = opts.log ?? consoleLogger;
  const db = jobPool();
  const { rows: runs } = await db.query<{ job: string; at: Date }>(
    `SELECT job, MAX("startedAt") AS at FROM "IngestionRun"
     WHERE job IN ('match_tickers', 'edgar_companies', 'edgar_submissions') AND status = 'SUCCEEDED' GROUP BY job`,
  );
  const last = (job: string) => runs.find((r) => r.job === job)?.at ?? null;
  const lastMatch = last("match_tickers");
  const companiesChanged = [last("edgar_companies"), last("edgar_submissions")].some((d) => d && (!lastMatch || d > lastMatch));
  const since = opts.full || companiesChanged ? null : lastMatch;

  let touchedCiks: string[] = [];
  await runChunk(
    {
      job: "match_tickers",
      chunkKey: since ? `incremental:${since.toISOString()}` : "full",
      params: { since: since?.toISOString() ?? null, minObligationUsd: mappingConfig.minObligationUsd },
      force: true,
      attempts: 2,
      baseDelayMs: 10_000,
      log,
    },
    async ({ client, stats }) => {
      await client.query(`SELECT set_config('pg_trgm.similarity_threshold', $1, false)`, [
        String(mappingConfig.candidateMinSimilarity),
      ]);
      const eligible = await loadEligible(client, since);
      stats.rowsRead = eligible.length;
      log.info(`match: ${eligible.length} eligible recipients`);
      if (!eligible.length) return;

      const nodes = await loadNodes(client, eligible);
      const roots = new Map<string, Root>(eligible.map((r) => [r.id, resolveRoot(r, nodes)]));
      const rootIds = [...new Set([...roots.values()].map((r) => r.id))];

      // Reviewed decisions at root level flow down to subsidiaries.
      const { rows: rootReviews } = await client.query<ExistingMatch>(
        `SELECT "recipientId", "companyCik", status, method, confidence FROM "TickerMatch"
         WHERE "recipientId" = ANY($1::text[]) AND (status <> 'PENDING' OR method = 'MANUAL')`,
        [rootIds],
      );
      const reviewedRoot = new Map(rootReviews.map((m) => [m.recipientId, m]));

      // One decision per root name.
      const rootNames = new Map<string, string>(); // root id -> normalized name
      for (const root of roots.values()) rootNames.set(root.id, normalizeName(root.name));
      const types = new Map(eligible.map((r) => [r.id, r.recipientType]));
      const candidates = await findCandidates(client, [...new Set(rootNames.values())]);
      const decisions = new Map<string, MatchDecision>();
      for (const [rootId, name] of rootNames) {
        // A root that's also a recipient uses its own type; parent-only roots are assumed businesses.
        decisions.set(rootId, decide(name, types.get(rootId) ?? "BUSINESS", candidates.get(name) ?? []));
      }

      const desired: DesiredMatch[] = [];
      for (const r of eligible) {
        const root = roots.get(r.id)!;
        const isRoot = root.id === r.id;
        const evidenceBase = { root: { id: root.id, name: root.name }, chain: root.chain };
        const review = reviewedRoot.get(root.id);

        if (!isRoot && review) {
          if (review.status === "REJECTED" || !review.companyCik) continue;
          desired.push({
            recipientId: r.id,
            companyCik: review.companyCik,
            confidence: inheritedConfidence(1),
            method: "UEI_PARENT_ROLLUP",
            parentRecipientId: root.id,
            obligationAtStake: r.total,
            evidence: { ...evidenceBase, reason: `parent ${root.id} was ${review.status.toLowerCase()} by a reviewer` },
          });
          continue;
        }
        // Non-business recipients never match, even through a parent.
        if (r.recipientType !== "BUSINESS" && r.recipientType !== "UNKNOWN") continue;
        const decision = decisions.get(root.id);
        const best = decision?.best;
        if (!best) continue;
        desired.push({
          recipientId: r.id,
          companyCik: best.cik,
          confidence: isRoot ? best.score : inheritedConfidence(best.score),
          method: isRoot ? best.method : "UEI_PARENT_ROLLUP",
          parentRecipientId: root.id,
          obligationAtStake: r.total,
          evidence: { ...evidenceBase, normalizedName: rootNames.get(root.id), candidates: decision.candidates, reasons: best.reasons },
        });
      }

      const ids = eligible.map((r) => r.id);
      const { rows: existing } = await client.query<ExistingMatch>(
        `SELECT "recipientId", "companyCik", status, method, confidence FROM "TickerMatch" WHERE "recipientId" = ANY($1::text[])`,
        [ids],
      );
      const locked = new Set(existing.filter(isHumanDecision).map((m) => m.recipientId));
      const writes = desired.filter((d) => !locked.has(d.recipientId));
      const keep = new Set(writes.map((d) => d.recipientId));
      const stale = existing.filter((m) => !locked.has(m.recipientId) && !keep.has(m.recipientId)).map((m) => m.recipientId);
      touchedCiks = [...new Set([...writes.map((d) => d.companyCik), ...existing.map((m) => m.companyCik).filter((c): c is string => !!c)])];

      await client.query("BEGIN");
      try {
        if (stale.length) {
          await client.query(`DELETE FROM "TickerMatch" WHERE "recipientId" = ANY($1::text[]) AND status = 'PENDING' AND method <> 'MANUAL'`, [stale]);
        }
        for (let i = 0; i < writes.length; i += BATCH) {
          const b = writes.slice(i, i + BATCH);
          const res = await client.query(
            `INSERT INTO "TickerMatch" ("recipientId", "companyCik", confidence, method, status, "parentRecipientId",
                                        "obligationAtStake", evidence, "createdAt", "updatedAt")
             SELECT u.id, u.cik, u.conf, u.method::"MatchMethod", 'PENDING', u.parent, u.total, u.evidence, now(), now()
             FROM unnest($1::text[], $2::text[], $3::float8[], $4::text[], $5::text[], $6::numeric[], $7::jsonb[])
               AS u(id, cik, conf, method, parent, total, evidence)
             ON CONFLICT ("recipientId") DO UPDATE SET
               "companyCik" = EXCLUDED."companyCik", confidence = EXCLUDED.confidence, method = EXCLUDED.method,
               "parentRecipientId" = EXCLUDED."parentRecipientId", "obligationAtStake" = EXCLUDED."obligationAtStake",
               evidence = EXCLUDED.evidence, "updatedAt" = now()
             WHERE "TickerMatch".status = 'PENDING' AND "TickerMatch".method <> 'MANUAL'`,
            [
              b.map((d) => d.recipientId),
              b.map((d) => d.companyCik),
              b.map((d) => d.confidence),
              b.map((d) => d.method),
              b.map((d) => d.parentRecipientId),
              b.map((d) => d.obligationAtStake),
              b.map((d) => JSON.stringify(d.evidence)),
            ],
          );
          stats.rowsUpserted += res.rowCount ?? 0;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      stats.rowsSkipped = eligible.length - writes.length;
      log.info(`match: ${writes.length} matches written, ${locked.size} reviewed rows kept, ${stale.length} stale removed`);
    },
  );
  return { touchedCiks };
}
