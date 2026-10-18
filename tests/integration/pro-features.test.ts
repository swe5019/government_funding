import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Watchlists, alerts, screener and feed against a real Postgres. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const silent = { info: () => {}, error: () => {} };
const LMT = "0000936468";
const MU = "0000723125";

const sent: { to: string; subject: string; text: string }[] = [];
let failSends = false;
vi.mock("@/lib/email/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async (msg: { to: string; subject: string; text: string }) => {
    if (failSends) throw new Error("smtp down");
    sent.push(msg);
  }),
}));

describe.skipIf(!url)("Pro features (integration)", async () => {
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = url;
  const { jobPool, closeJobPool } = await import("@/jobs/runner");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { rollupRecipients } = await import("@/jobs/rollup");
  const { edgarCompanies } = await import("@/jobs/edgar-companies");
  const { matchTickers } = await import("@/jobs/match-tickers");
  const { rollupCompanies } = await import("@/jobs/rollup-companies");
  const { sendAlerts, alertDeliveries } = await import("@/jobs/alerts");
  const wl = await import("@/lib/watchlists");
  const { runScreener } = await import("@/lib/screener/query");
  const { parseScreenerFilters } = await import("@/lib/screener/filters");
  const { getLargeAwardsFeed } = await import("@/lib/feed");
  const { dataWindow } = await import("@/lib/gating/dataCutoff");
  const { plans } = await import("@/config/plans");
  const { prisma } = await import("@/lib/db");

  const pro = dataWindow(plans.pro.entitlements);
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await jobPool().query(sql, params)).rows as T[];
  const BASE = "9700_-NONE-_N0001925C0001_0_-NONE-_0"; // $1.25B
  const MOD = "9700_-NONE-_N0001925C0001_P00001_-NONE-_0"; // $150M
  const SIK = "5700_-NONE-_FA862526C0042_0_-NONE-_0"; // $48.5M

  beforeAll(async () => {
    await q(`TRUNCATE "AlertDelivery", "WatchlistItem", "Watchlist", "Subscription", "User", "PriceBar", "AwardProgram",
             "TickerMatch", "CompanyAwardMonthly", "CompanyAlias", "Company", "AuditLog", "AwardTransaction", "Award",
             "RecipientAwardMonthly", "Recipient", "SubAgency", "Agency", "IngestionRun", "DataFreshness" CASCADE`);
    for (const f of ["All_Contracts_PrimeTransactions_sample_1.csv", "All_Assistance_PrimeTransactions_sample_1.csv"]) {
      await usaspendingLoadLocal(path.join(fixtures, f), { log: silent });
    }
    await edgarCompanies({ file: path.join(fixtures, "company_tickers_exchange.json"), log: silent });
    await rollupRecipients({ full: true, log: silent });
    await matchTickers({ full: true, log: silent });
    await rollupCompanies({ log: silent });

    await prisma.user.createMany({
      data: [
        { id: "pro_user", email: "pro@example.com" },
        { id: "free_user", email: "free@example.com" },
        { id: "other_user", email: "other@example.com" },
      ],
    });
    await prisma.subscription.create({
      data: {
        stripeSubscriptionId: "sub_pro",
        userId: "pro_user",
        planKey: "pro",
        interval: "month",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await closeJobPool();
  });

  it("watchlists: default list, threshold, limits and ownership", async () => {
    const list = await wl.addToWatchlist("pro_user", null, LMT);
    expect(list.name).toBe("My watchlist");
    await wl.setAlertThreshold("pro_user", list.id, LMT, 100_000_000);
    await wl.addToWatchlist("pro_user", list.id, LMT); // idempotent
    const lists = await wl.listWatchlists("pro_user");
    expect(lists[0].items.map((i) => [i.companyCik, Number(i.alertThreshold)])).toEqual([[LMT, 100_000_000]]);
    await expect(wl.removeFromWatchlist("other_user", list.id, LMT)).rejects.toThrow(/not found/);
    await expect(wl.setAlertThreshold("pro_user", list.id, LMT, -5)).rejects.toThrow(/positive/);
    await expect(wl.createWatchlist("pro_user", "My watchlist")).rejects.toThrow(/already/);
    // The free user watches too (e.g. left over from a lapsed subscription): no alerts for them.
    const freeList = await wl.addToWatchlist("free_user", null, LMT);
    await wl.setAlertThreshold("free_user", freeList.id, LMT, 1);
    // Backdate both items so the newly published awards below are "after they were added".
    await q(`UPDATE "WatchlistItem" SET "createdAt" = now() - interval '10 days'`);
  });

  it("alerts: new awards above the threshold, once, Pro users only", async () => {
    await q(`UPDATE "AwardTransaction" SET "availableAt" = now() - interval '1 day' WHERE id = ANY($1)`, [[BASE, MOD, SIK]]);
    await sendAlerts({ log: silent });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("pro@example.com");
    expect(sent[0].subject).toContain("LMT");
    expect(sent[0].text).toContain("https://www.usaspending.gov/award/");
    expect(await alertDeliveries("pro_user")).toEqual([BASE, MOD].sort()); // $48.5M is under the $100M threshold
    expect(await alertDeliveries("free_user")).toEqual([]);

    await sendAlerts({ log: silent });
    expect(sent).toHaveLength(1); // nothing new
  });

  it("alerts: don't flood a new watcher with awards published before they added the company", async () => {
    await wl.addToWatchlist("pro_user", null, MU);
    await wl.setAlertThreshold("pro_user", (await wl.defaultWatchlist("pro_user")).id, MU, 1);
    await q(`UPDATE "AwardTransaction" SET "availableAt" = now() - interval '2 days' WHERE id = '1341_CHIPS0001_-NONE-_0'`);
    await sendAlerts({ log: silent });
    expect(sent).toHaveLength(1);
  });

  it("alerts: a failed send releases its claims so the next run retries", async () => {
    await q(`UPDATE "AwardTransaction" SET "availableAt" = now() - interval '1 hour' WHERE id = $1`, [SIK]);
    await wl.setAlertThreshold("pro_user", (await wl.defaultWatchlist("pro_user")).id, LMT, 1_000_000);
    failSends = true;
    await expect(sendAlerts({ log: silent })).rejects.toThrow(/failed/);
    expect(await alertDeliveries("pro_user")).not.toContain(SIK);
    failSends = false;
    await sendAlerts({ log: silent });
    expect(sent).toHaveLength(2);
    expect(await alertDeliveries("pro_user")).toContain(SIK);
  });

  it("screener: totals, growth filter, agency filter and sorting", async () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const all = await runScreener(parseScreenerFilters({}), pro, now);
    expect(all.map((r) => r.ticker)).toEqual(["LMT", "MU"]);
    expect(all[0]).toMatchObject({ last12: 1_448_500_000, prior12: 0, growth: null, topAgency: "Department of Defense" });

    expect((await runScreener(parseScreenerFilters({ agency: "013" }), pro, now)).map((r) => r.ticker)).toEqual(["MU"]);
    expect((await runScreener(parseScreenerFilters({ minLast12: "600000000" }), pro, now)).map((r) => r.ticker)).toEqual(["LMT"]);
    expect(await runScreener(parseScreenerFilters({ minGrowth: "10" }), pro, now)).toEqual([]); // no prior-year awards
    expect((await runScreener(parseScreenerFilters({ sort: "ticker", dir: "desc" }), pro, now)).map((r) => r.ticker)).toEqual(["MU", "LMT"]);
  });

  it("feed: newly published large awards, honoring the free-tier delay", async () => {
    const items = await getLargeAwardsFeed(pro, { minUsd: 10_000_000, days: 7 });
    expect(items.map((i) => i.transactionId)).toEqual(expect.arrayContaining([BASE, MOD, SIK]));
    expect(items.every((i) => Number(i.obligation) >= 10_000_000)).toBe(true);
    expect(items[0].sourceUrl).toMatch(/^https:\/\//);
    const big = await getLargeAwardsFeed(pro, { minUsd: 100_000_000, days: 7 });
    expect(big.map((i) => i.transactionId)).not.toContain(SIK);
    // Free view: everything published within the last 7 days is still hidden.
    expect(await getLargeAwardsFeed(dataWindow(plans.free.entitlements), { minUsd: 1, days: 7 })).toEqual([]);
  });
});
