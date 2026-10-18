import { featureConfig } from "@/config/features";
import { prisma } from "@/lib/db";

const cfg = featureConfig.watchlists;

export class WatchlistError extends Error {}

export async function listWatchlists(userId: string) {
  return prisma.watchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { company: { select: { cik: true, ticker: true, name: true } } },
      },
    },
  });
}

/** The user's first watchlist, created on demand ("My watchlist"). */
export async function defaultWatchlist(userId: string) {
  const existing = await prisma.watchlist.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  return existing ?? prisma.watchlist.create({ data: { userId, name: "My watchlist" } });
}

export async function createWatchlist(userId: string, rawName: string) {
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new WatchlistError("Give the watchlist a name.");
  const count = await prisma.watchlist.count({ where: { userId } });
  if (count >= cfg.maxWatchlists) throw new WatchlistError(`You can have up to ${cfg.maxWatchlists} watchlists.`);
  try {
    return await prisma.watchlist.create({ data: { userId, name } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new WatchlistError("You already have a watchlist with that name.");
    throw e;
  }
}

/** All mutations check ownership by filtering on userId, so IDs from forms can't touch other users' lists. */
async function ownedWatchlist(userId: string, watchlistId: string) {
  const wl = await prisma.watchlist.findFirst({ where: { id: watchlistId, userId } });
  if (!wl) throw new WatchlistError("Watchlist not found.");
  return wl;
}

export async function deleteWatchlist(userId: string, watchlistId: string) {
  await ownedWatchlist(userId, watchlistId);
  await prisma.watchlist.delete({ where: { id: watchlistId } });
}

export async function addToWatchlist(userId: string, watchlistId: string | null, companyCik: string) {
  const wl = watchlistId ? await ownedWatchlist(userId, watchlistId) : await defaultWatchlist(userId);
  const count = await prisma.watchlistItem.count({ where: { watchlistId: wl.id } });
  if (count >= cfg.maxItemsPerWatchlist) throw new WatchlistError(`A watchlist can hold up to ${cfg.maxItemsPerWatchlist} companies.`);
  await prisma.watchlistItem.upsert({
    where: { watchlistId_companyCik: { watchlistId: wl.id, companyCik } },
    create: { watchlistId: wl.id, companyCik, alertThreshold: cfg.defaultAlertThresholdUsd },
    update: {},
  });
  return wl;
}

export async function removeFromWatchlist(userId: string, watchlistId: string, companyCik: string) {
  await ownedWatchlist(userId, watchlistId);
  await prisma.watchlistItem.deleteMany({ where: { watchlistId, companyCik } });
}

/** null threshold = no email alerts for this company. */
export async function setAlertThreshold(userId: string, watchlistId: string, companyCik: string, threshold: number | null) {
  await ownedWatchlist(userId, watchlistId);
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) throw new WatchlistError("Enter a positive dollar amount.");
  await prisma.watchlistItem.updateMany({ where: { watchlistId, companyCik }, data: { alertThreshold: threshold } });
}

/** Watchlists (by id) that already contain the company, for the company page button state. */
export async function watchlistsContaining(userId: string, companyCik: string): Promise<string[]> {
  const rows = await prisma.watchlistItem.findMany({ where: { companyCik, watchlist: { userId } }, select: { watchlistId: true } });
  return rows.map((r) => r.watchlistId);
}

/** Last-12-month confirmed totals and latest award date per company, for the watchlist table. */
export async function companySummaries(ciks: string[], view: "REALTIME" | "DELAYED", now = new Date()) {
  if (!ciks.length) return new Map<string, { last12: number; latest: Date | null }>();
  const since12 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const rows = await prisma.$queryRaw<{ cik: string; last12: string; latest: Date | null }[]>`
    SELECT "companyCik" AS cik, SUM(obligated)::text AS last12, MAX(month) FILTER (WHERE obligated <> 0) AS latest
    FROM "CompanyAwardMonthly"
    WHERE "companyCik" = ANY(${ciks}::text[]) AND view = ${view}::"DataView" AND "agencyCode" = 'ALL'
      AND category = 'ALL' AND NOT "includesPossible" AND month >= ${since12}::date
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.cik, { last12: Number(r.last12), latest: r.latest }]));
}
