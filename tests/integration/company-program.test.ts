import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Company and program page queries + program tagging + price sync. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const silent = { info: () => {}, error: () => {} };
const LMT = "0000936468";
const MU = "0000723125";

describe.skipIf(!url)("company and program data (integration)", async () => {
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = url;
  const { jobPool, closeJobPool } = await import("@/jobs/runner");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { rollupRecipients } = await import("@/jobs/rollup");
  const { edgarCompanies } = await import("@/jobs/edgar-companies");
  const { matchTickers } = await import("@/jobs/match-tickers");
  const { rollupCompanies } = await import("@/jobs/rollup-companies");
  const { tagPrograms } = await import("@/jobs/tag-programs");
  const { syncPrices } = await import("@/jobs/prices");
  const companies = await import("@/lib/companies");
  const programs = await import("@/lib/programs/queries");
  const { dataWindow } = await import("@/lib/gating/dataCutoff");
  const { plans } = await import("@/config/plans");
  const { prisma } = await import("@/lib/db");

  const realtime = dataWindow(plans.pro.entitlements);
  const delayed = () => dataWindow(plans.free.entitlements);
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await jobPool().query(sql, params)).rows as T[];
  const sum = (xs: { obligated: number }[]) => xs.reduce((s, x) => s + x.obligated, 0);

  beforeAll(async () => {
    await q(`TRUNCATE "PriceBar", "AwardProgram", "Program", "TickerMatch", "CompanyAwardMonthly", "CompanyAlias", "Company",
             "AuditLog", "AwardTransaction", "Award", "RecipientAwardMonthly", "Recipient", "SubAgency", "Agency",
             "IngestionRun", "DataFreshness" CASCADE`);
    for (const f of ["All_Contracts_PrimeTransactions_sample_1.csv", "All_Assistance_PrimeTransactions_sample_1.csv"]) {
      await usaspendingLoadLocal(path.join(fixtures, f), { log: silent });
    }
    await edgarCompanies({ file: path.join(fixtures, "company_tickers_exchange.json"), log: silent });
    await rollupRecipients({ full: true, log: silent });
    await matchTickers({ full: true, log: silent });
    await rollupCompanies({ log: silent });
    await tagPrograms({ log: silent });
  });
  afterAll(async () => {
    delete process.env.MARKET_DATA_PROVIDER;
    await prisma.$disconnect();
    await closeJobPool();
  });

  it("tags CHIPS awards by assistance listing, idempotently", async () => {
    await tagPrograms({ log: silent });
    const rows = await q<{ awardId: string }>(`SELECT "awardId" FROM "AwardProgram" WHERE "programSlug" = 'chips-act'`);
    expect(rows.map((r) => r.awardId)).toEqual(["ASST_NON_CHIPS0001_1341"]);
  });

  it("lists public companies receiving program funds", async () => {
    const { confirmed, possible } = await programs.getProgramCompanies("chips-act", realtime);
    expect(confirmed).toMatchObject([{ cik: MU, ticker: "MU", total: 500_000_000, awards: 1 }]);
    expect(possible).toEqual([]);
    const summary = await programs.getProgramSummary("chips-act", realtime);
    expect(summary).toMatchObject({ total: 500_000_000, publicTotal: 500_000_000, awardCount: 1, recipientCount: 1 });
    const [largest] = await programs.getProgramLargestAwards("chips-act", realtime);
    expect(largest).toMatchObject({ ticker: "MU", sourceUrl: expect.stringMatching(/^https:\/\/www\.usaspending\.gov\/award\//) });
    expect((await programs.listPrograms(realtime))[0]).toMatchObject({ slug: "chips-act", publicCompanies: 1 });
  });

  it("finds companies by any share-class ticker", async () => {
    expect((await companies.getCompanyByTicker("goog"))?.ticker).toBe("GOOGL");
    expect(await companies.getCompanyByTicker("X:0000936468")).toBeNull();
  });

  it("totals a company across its subsidiaries, with top agency and source links", async () => {
    expect(sum(await companies.getCompanyMonthly(LMT, realtime))).toBe(1_448_500_000);
    expect((await companies.getTopAgencies(LMT, realtime))[0]).toMatchObject({ key: "097", label: "Department of Defense" });
    const largest = await companies.getCompanyLargestAwards(LMT, realtime, 15, new Date("2025-01-01"));
    expect(largest.map((a) => a.recipientName)).toContain("SIKORSKY AIRCRAFT CORPORATION");
    expect(largest.every((a) => a.sourceUrl.startsWith("https://www.usaspending.gov/award/"))).toBe(true);
    const recipients = await companies.getCompanyRecipients(LMT, realtime);
    expect(recipients.map((r) => [r.name, r.display])).toEqual([
      ["LOCKHEED MARTIN CORPORATION", "confirmed"],
      ["SIKORSKY AIRCRAFT CORPORATION", "confirmed"],
    ]);
    const events = await companies.getAwardEvents(LMT, realtime, new Date("2025-01-01"));
    expect(events.map((e) => e.date)).toEqual(["2026-02-10", "2026-03-18", "2026-05-03"]);
  });

  it("hides recently published awards from the free (delayed) view", async () => {
    await q(`UPDATE "AwardTransaction" SET "availableAt" = now() WHERE id = '9700_-NONE-_N0001925C0001_P00001_-NONE-_0'`);
    await rollupCompanies({ log: silent });
    expect(sum(await companies.getCompanyMonthly(LMT, delayed()))).toBe(1_298_500_000);
    expect(sum(await companies.getCompanyMonthly(LMT, realtime))).toBe(1_448_500_000);
    const free = await companies.getCompanyLargestAwards(LMT, delayed(), 15, new Date("2025-01-01"));
    expect(free.map((a) => a.transactionId)).not.toContain("9700_-NONE-_N0001925C0001_P00001_-NONE-_0");
  });

  it("stores prices only when a provider is configured", async () => {
    delete process.env.MARKET_DATA_PROVIDER;
    await syncPrices({ log: silent });
    expect(Number((await q<{ n: string }>(`SELECT count(*) n FROM "PriceBar"`))[0].n)).toBe(0);

    process.env.MARKET_DATA_PROVIDER = "mock";
    await syncPrices({ log: silent });
    const rows = await q<{ cik: string; provider: string }>(`SELECT DISTINCT "companyCik" cik, provider FROM "PriceBar" ORDER BY 1`);
    expect(rows).toEqual([
      { cik: MU, provider: "mock" },
      { cik: LMT, provider: "mock" },
    ]);
  });
});
