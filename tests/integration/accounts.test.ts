import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Account deletion and the admin users list against a real Postgres. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("accounts (integration)", async () => {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const { prisma } = await import("@/lib/db");
  const { deleteUserData } = await import("@/lib/account/delete");
  const { getUserSummary, listUsers } = await import("@/lib/admin/users");

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "AlertDelivery", "WatchlistItem", "Watchlist", "Subscription", "Session", "Account", "VerificationToken",
                "AuditLog", "TickerMatch", "Recipient", "Company", "User" CASCADE`,
    );
    await prisma.company.create({ data: { cik: "0000000001", ticker: "TST", tickers: ["TST"], name: "Test Corp" } });
    await prisma.recipient.create({ data: { id: "R1", name: "TEST CORP", normalizedName: "TEST CORP" } });
    const day = 86_400_000;
    await prisma.user.create({ data: { id: "u_free", email: "free@example.test", createdAt: new Date(Date.now() - 40 * day) } });
    await prisma.user.create({
      data: {
        id: "u_pro",
        email: "pro@example.test",
        role: "ADMIN",
        acceptedDisclaimerAt: new Date(),
        sessions: { create: { sessionToken: "tok_pro", expires: new Date(Date.now() + 29 * day) } },
        accounts: { create: { type: "oidc", provider: "google", providerAccountId: "g1" } },
        subscription: {
          create: { stripeSubscriptionId: "sub_x", planKey: "pro", interval: "month", status: "active", currentPeriodEnd: new Date(Date.now() + 20 * day) },
        },
        watchlists: { create: { name: "Mine", items: { create: { companyCik: "0000000001" } } } },
        alerts: { create: { companyCik: "0000000001", transactionId: "tx1" } },
      },
    });
    await prisma.verificationToken.create({ data: { identifier: "pro@example.test", token: "t1", expires: new Date(Date.now() + day) } });
    await prisma.tickerMatch.create({
      data: { recipientId: "R1", companyCik: "0000000001", confidence: 1, method: "MANUAL", status: "APPROVED", evidence: {}, reviewedById: "u_pro" },
    });
    await prisma.auditLog.create({ data: { userId: "u_pro", action: "approve", entity: "TickerMatch", entityId: "R1" } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists users with plan, approximate last activity and watchlist size", async () => {
    const users = await listUsers();
    expect(users.map((u) => u.email)).toEqual(["pro@example.test", "free@example.test"]);
    const [pro, free] = users;
    expect(pro).toMatchObject({ role: "ADMIN", subscriptionStatus: "active", interval: "month", watchlistItems: 1 });
    expect(Math.abs(pro.lastActiveAt!.getTime() - (Date.now() - 86_400_000))).toBeLessThan(60_000);
    expect(free).toMatchObject({ subscriptionStatus: null, lastActiveAt: null, watchlistItems: 0 });
    expect((await listUsers({ q: "FREE@" })).map((u) => u.id)).toEqual(["u_free"]);
    expect(await listUsers({ q: "%" })).toEqual([]);
    expect(await getUserSummary()).toEqual({ total: 2, last7Days: 1, last30Days: 1, trialing: 0, active: 1, pastDue: 0 });
  });

  it("deletes a user's personal data and detaches review history", async () => {
    expect(await deleteUserData("u_pro")).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: "u_pro" } })).toBeNull();
    const counts = await Promise.all([
      prisma.session.count(),
      prisma.account.count(),
      prisma.subscription.count(),
      prisma.watchlist.count(),
      prisma.watchlistItem.count(),
      prisma.alertDelivery.count(),
      prisma.verificationToken.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(await prisma.tickerMatch.findUnique({ where: { recipientId: "R1" } })).toMatchObject({ status: "APPROVED", reviewedById: null });
    expect(await prisma.auditLog.findFirst()).toMatchObject({ action: "approve", userId: null });
    expect(await prisma.user.count()).toBe(1);
    expect(await deleteUserData("u_pro")).toBe(false);
  });
});
