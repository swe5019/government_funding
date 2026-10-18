import { FREE_TIER_DELAY_DAYS } from "@/config/plans";
import { mappingConfig } from "@/config/mapping";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { COMPANY_ROLLUP_DELETE, COMPANY_ROLLUP_INSERT } from "@/lib/mapping/sql";

export type QueueFilter = "review" | "auto" | "approved" | "corrected" | "rejected" | "all";

export const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "review", label: "Needs review" },
  { key: "auto", label: "Auto-confirmed" },
  { key: "approved", label: "Approved" },
  { key: "corrected", label: "Corrected" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const T = mappingConfig.confidenceThreshold;

function filterSql(f: QueueFilter): Prisma.Sql {
  switch (f) {
    case "review":
      return Prisma.sql`tm.status = 'PENDING' AND tm.confidence < ${T}`;
    case "auto":
      return Prisma.sql`tm.status = 'PENDING' AND tm.confidence >= ${T}`;
    case "approved":
      return Prisma.sql`tm.status = 'APPROVED'`;
    case "corrected":
      return Prisma.sql`tm.status = 'CORRECTED'`;
    case "rejected":
      return Prisma.sql`tm.status = 'REJECTED'`;
    default:
      return Prisma.sql`TRUE`;
  }
}

export interface QueueMember {
  recipientId: string;
  name: string;
  uei: string | null;
  companyCik: string | null;
  ticker: string | null;
  companyName: string | null;
  confidence: number;
  method: string;
  status: string;
  obligationAtStake: string | null;
  evidence: {
    root?: { id: string; name: string };
    chain?: string[];
    normalizedName?: string;
    reasons?: string[];
    reason?: string;
    candidates?: { cik: string; ticker: string; companyName: string; matchedName: string; source: string; score: number; reasons: string[] }[];
  };
}

export interface QueueGroup {
  /** Roll-up root (TickerMatch.parentRecipientId). */
  groupId: string;
  rootName: string;
  members: QueueMember[];
  total: number;
  topConfidence: number;
}

/** Review queue grouped by roll-up root, largest dollars first. */
export async function listQueue(filter: QueueFilter, q: string, limit = 50): Promise<QueueGroup[]> {
  const search = q.trim() ? Prisma.sql`AND (r.name ILIKE ${"%" + q.trim() + "%"} OR c.ticker = ${q.trim().toUpperCase()} OR r.uei = ${q.trim().toUpperCase()})` : Prisma.empty;
  const rows = await prisma.$queryRaw<(QueueMember & { groupId: string })[]>`
    WITH groups AS (
      SELECT COALESCE(tm."parentRecipientId", tm."recipientId") AS gid, SUM(tm."obligationAtStake") AS total
      FROM "TickerMatch" tm
      JOIN "Recipient" r ON r.id = tm."recipientId"
      LEFT JOIN "Company" c ON c.cik = tm."companyCik"
      WHERE ${filterSql(filter)} ${search}
      GROUP BY 1
      ORDER BY total DESC NULLS LAST
      LIMIT ${limit}
    )
    SELECT g.gid AS "groupId", tm."recipientId", r.name, r.uei, tm."companyCik", c.ticker, c.name AS "companyName",
           tm.confidence, tm.method::text AS method, tm.status::text AS status,
           tm."obligationAtStake"::text AS "obligationAtStake", tm.evidence
    FROM groups g
    JOIN "TickerMatch" tm ON COALESCE(tm."parentRecipientId", tm."recipientId") = g.gid
    JOIN "Recipient" r ON r.id = tm."recipientId"
    LEFT JOIN "Company" c ON c.cik = tm."companyCik"
    WHERE ${filterSql(filter)}
    ORDER BY g.total DESC NULLS LAST, (tm."recipientId" = g.gid) DESC, tm."obligationAtStake" DESC NULLS LAST`;

  const groups = new Map<string, QueueGroup>();
  for (const { groupId, ...m } of rows) {
    let g = groups.get(groupId);
    if (!g) {
      g = { groupId, rootName: m.evidence?.root?.name ?? m.name, members: [], total: 0, topConfidence: 0 };
      groups.set(groupId, g);
    }
    g.members.push(m);
    g.total += Number(m.obligationAtStake ?? 0);
    g.topConfidence = Math.max(g.topConfidence, m.confidence);
  }
  return [...groups.values()];
}

export interface UnmatchedRecipient {
  id: string;
  name: string;
  uei: string | null;
  parentName: string | null;
  total: string;
}

/** Largest eligible recipients with no company link at all (candidates for manual linking). */
export async function listUnmatched(q: string, limit = 50): Promise<UnmatchedRecipient[]> {
  const search = q.trim() ? Prisma.sql`AND r.name ILIKE ${"%" + q.trim() + "%"}` : Prisma.empty;
  return prisma.$queryRaw<UnmatchedRecipient[]>`
    SELECT r.id, r.name, r.uei, r."parentName", m.total::text AS total
    FROM "Recipient" r
    JOIN (SELECT "recipientId", SUM(obligated) AS total FROM "RecipientAwardMonthly" WHERE view = 'REALTIME' GROUP BY 1) m
      ON m."recipientId" = r.id
    WHERE r."recipientType" IN ('BUSINESS', 'UNKNOWN') AND m.total >= ${mappingConfig.minObligationUsd}
      AND NOT EXISTS (SELECT 1 FROM "TickerMatch" tm WHERE tm."recipientId" = r.id) ${search}
    ORDER BY m.total DESC
    LIMIT ${limit}`;
}

export async function findCompanyByTicker(ticker: string) {
  const t = ticker.trim().toUpperCase();
  if (!t) return null;
  return prisma.company.findFirst({ where: { OR: [{ ticker: t }, { tickers: { has: t } }] } });
}

export type Decision =
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "reopen" }
  | { kind: "correct"; companyCik: string };

export interface DecisionTarget {
  /** Apply to every row in this roll-up group... */
  groupId?: string;
  /** ...or to exactly these recipients. */
  recipientIds?: string[];
}

/**
 * Record a reviewer decision. Group decisions skip rows another reviewer already decided
 * (except reopen/correct, which are explicit overrides). Returns the number of rows changed.
 */
export async function applyDecision(target: DecisionTarget, decision: Decision, reviewer: string): Promise<number> {
  const where: Prisma.TickerMatchWhereInput = target.groupId
    ? { OR: [{ parentRecipientId: target.groupId }, { recipientId: target.groupId }] }
    : { recipientId: { in: target.recipientIds ?? [] } };
  if (target.groupId && (decision.kind === "approve" || decision.kind === "reject")) {
    where.status = "PENDING";
  }

  const before = await prisma.tickerMatch.findMany({ where });
  if (!before.length) return 0;
  const now = new Date();
  const note = `by ${reviewer} (admin)`;
  const data: Prisma.TickerMatchUpdateManyMutationInput = { reviewedAt: now, notes: note };
  switch (decision.kind) {
    case "approve":
      Object.assign(data, { status: "APPROVED" });
      break;
    case "reject":
      Object.assign(data, { status: "REJECTED" });
      break;
    case "reopen":
      Object.assign(data, { status: "PENDING", reviewedAt: null, notes: null });
      break;
    case "correct":
      Object.assign(data, { status: "CORRECTED", companyCik: decision.companyCik, confidence: 1, method: "MANUAL" });
      break;
  }
  // Approving a row with no company would confirm nothing; skip those.
  const updateWhere = decision.kind === "approve" ? { ...where, companyCik: { not: null } } : where;

  const affectedCiks = [
    ...new Set([...before.map((m) => m.companyCik), decision.kind === "correct" ? decision.companyCik : null].filter((c): c is string => !!c)),
  ];
  await prisma.$transaction(async (tx) => {
    await tx.tickerMatch.updateMany({ where: updateWhere, data });
    await tx.auditLog.create({
      data: {
        action: `ticker_match.${decision.kind}`,
        entity: "TickerMatch",
        entityId: target.groupId ?? (target.recipientIds ?? []).join(","),
        before: before.map((m) => ({ recipientId: m.recipientId, companyCik: m.companyCik, status: m.status, confidence: m.confidence })),
        after: { decision, reviewer },
      },
    });
  });
  await rollupCompanyTotals(affectedCiks);
  return before.length;
}

/** Link recipients that had no match to a company chosen by a reviewer. */
export async function linkRecipient(recipientId: string, companyCik: string, reviewer: string) {
  const rec = await prisma.recipient.findUniqueOrThrow({ where: { id: recipientId } });
  const total = await prisma.recipientAwardMonthly.aggregate({ where: { recipientId, view: "REALTIME" }, _sum: { obligated: true } });
  const evidence = { root: { id: recipientId, name: rec.name }, reason: `linked manually by ${reviewer}` };
  await prisma.$transaction(async (tx) => {
    await tx.tickerMatch.upsert({
      where: { recipientId },
      create: {
        recipientId, companyCik, confidence: 1, method: "MANUAL", status: "CORRECTED", parentRecipientId: recipientId,
        obligationAtStake: total._sum.obligated, evidence, reviewedAt: new Date(), notes: `by ${reviewer} (admin)`,
      },
      update: { companyCik, confidence: 1, method: "MANUAL", status: "CORRECTED", reviewedAt: new Date(), notes: `by ${reviewer} (admin)` },
    });
    await tx.auditLog.create({
      data: { action: "ticker_match.link", entity: "TickerMatch", entityId: recipientId, after: { companyCik, reviewer } },
    });
  });
  await rollupCompanyTotals([companyCik]);
}

/** Recompute CompanyAwardMonthly for the given companies (same SQL as the rollup job). */
export async function rollupCompanyTotals(ciks: string[]) {
  if (!ciks.length) return;
  const cutoff = new Date(Date.now() - FREE_TIER_DELAY_DAYS * 86_400_000);
  await prisma.$transaction([
    prisma.$executeRawUnsafe(COMPANY_ROLLUP_DELETE, ciks),
    prisma.$executeRawUnsafe(COMPANY_ROLLUP_INSERT, cutoff, ciks),
  ]);
}

export async function listRecentRuns(limit = 60) {
  return prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

export async function listFreshness() {
  return prisma.dataFreshness.findMany({ orderBy: { source: "asc" } });
}
