import { Prisma } from "@/generated/prisma/client";
import { SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** A session's expiry minus its lifetime ≈ when it was last refreshed. */
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_S * 1000;

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  acceptedDisclaimerAt: Date | null;
  subscriptionStatus: string | null;
  interval: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Approximate: sessions refresh at most daily. */
  lastActiveAt: Date | null;
  watchlistItems: number;
}

export interface UserSummary {
  total: number;
  last7Days: number;
  last30Days: number;
  trialing: number;
  active: number;
  pastDue: number;
}

export async function getUserSummary(): Promise<UserSummary> {
  const [row] = await prisma.$queryRaw<Record<keyof UserSummary, bigint>[]>`
    SELECT
      (SELECT count(*) FROM "User") AS total,
      (SELECT count(*) FROM "User" WHERE "createdAt" > now() - interval '7 days') AS "last7Days",
      (SELECT count(*) FROM "User" WHERE "createdAt" > now() - interval '30 days') AS "last30Days",
      (SELECT count(*) FROM "Subscription" WHERE status = 'trialing') AS trialing,
      (SELECT count(*) FROM "Subscription" WHERE status = 'active') AS active,
      (SELECT count(*) FROM "Subscription" WHERE status = 'past_due') AS "pastDue"`;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])) as unknown as UserSummary;
}

/** Newest first; `q` filters by email substring. */
export async function listUsers(opts: { q?: string; limit?: number } = {}): Promise<AdminUserRow[]> {
  const q = opts.q?.trim();
  const where = q ? Prisma.sql`WHERE u.email ILIKE ${"%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"}` : Prisma.empty;
  const rows = await prisma.$queryRaw<(Omit<AdminUserRow, "lastActiveAt" | "watchlistItems"> & {
    lastSessionExpires: Date | null;
    watchlistItems: bigint;
  })[]>`
    SELECT u.id, u.email, u.role::text AS role, u."createdAt", u."acceptedDisclaimerAt",
           s.status AS "subscriptionStatus", s.interval, s."trialEndsAt", s."currentPeriodEnd",
           COALESCE(s."cancelAtPeriodEnd", false) AS "cancelAtPeriodEnd",
           (SELECT max(expires) FROM "Session" se WHERE se."userId" = u.id) AS "lastSessionExpires",
           (SELECT count(*) FROM "WatchlistItem" wi JOIN "Watchlist" w ON w.id = wi."watchlistId" WHERE w."userId" = u.id)
             AS "watchlistItems"
    FROM "User" u LEFT JOIN "Subscription" s ON s."userId" = u.id
    ${where}
    ORDER BY u."createdAt" DESC
    LIMIT ${opts.limit ?? 200}`;
  return rows.map(({ lastSessionExpires, watchlistItems, ...r }) => ({
    ...r,
    lastActiveAt: lastSessionExpires ? new Date(lastSessionExpires.getTime() - SESSION_MAX_AGE_MS) : null,
    watchlistItems: Number(watchlistItems),
  }));
}
