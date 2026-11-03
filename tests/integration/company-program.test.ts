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
  const { rollupSummaries } = await import("@/jobs/rollup-summaries");
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

  it("tags quantum awards by phrase, only from the listed agencies", async () => {
    await q(`INSERT INTO "Agency" (code, name, "updatedAt") VALUES ('097', 'Department of Defense', now()),
               ('089', 'Department of Energy', now()), ('075', 'Department of Health and Human Services', now())
             ON CONFLICT (code) DO NOTHING`);
    const award = (id: string, agency: string, description: string) =>
      q(`INSERT INTO "Award" (id, category, "awardingAgencyCode", description, "totalObligated", "lastModifiedDate", "sourceUrl")
         VALUES ($1, 'CONTRACT', $2, $3, 1000000, '2026-03-01', 'https://www.usaspending.gov/award/' || $1)`, [id, agency, description]);
    await award("Q_DARPA", "097", "QUANTUM BENCHMARKING INITIATIVE STAGE B");
    await award("Q_DOE", "089", "Superconducting QUBIT fabrication for quantum computing testbeds");
    await award("Q_DOT", "097", "QUANTUM DOT DISPLAY PANELS");
    await award("Q_HHS", "075", "QUANTUM COMPUTING FOR DRUG DISCOVERY");
    await tagPrograms({ log: silent });
    const rows = await q<{ awardId: string }>(`SELECT "awardId" FROM "AwardProgram" WHERE "programSlug" = 'quantum' ORDER BY 1`);
    expect(rows.map((r) => r.awardId)).toEqual(["Q_DARPA", "Q_DOE"]);
    await q(`DELETE FROM "Award" WHERE id LIKE 'Q\\_%'`);
    await tagPrograms({ log: silent });
  });

  it("themes: whole-word keywords, exclusions, agency-wide and industry-code rules", async () => {
    await q(`INSERT INTO "Agency" (code, name, "updatedAt") VALUES ('097', 'Department of Defense', now()),
               ('070', 'Department of Homeland Security', now()), ('080', 'National Aeronautics and Space Administration', now()),
               ('015', 'Department of Justice', now())
             ON CONFLICT (code) DO NOTHING`);
    const award = (id: string, agency: string, description: string, naics: string | null = null, psc: string | null = null) =>
      q(`INSERT INTO "Award" (id, category, "awardingAgencyCode", description, "naicsCode", "pscCode", "totalObligated", "lastModifiedDate", "sourceUrl")
         VALUES ($1, 'CONTRACT', $2, $3, $4, $5, 1000000, '2026-03-01', 'https://www.usaspending.gov/award/' || $1)`,
        [id, agency, description, naics, psc]);
    await award("T_UAS", "097", "SMALL UAS RECONNAISSANCE KITS");
    await award("T_PERSUASIVE", "015", "PERSUASIVE COMMUNICATIONS TRAINING");
    await award("T_UASI", "070", "UASI GRANT ADMINISTRATION SUPPORT FOR SMALL UAS"); // excluded: UASI
    await award("T_NASA", "080", "WIND TUNNEL MAINTENANCE");
    await award("T_SATNAICS", "097", "SPARES", "336414");
    await award("T_SATOFFICE", "097", "LEASE OF SATELLITE OFFICE SPACE");
    await award("T_AI", "097", "AI-ENABLED TARGET RECOGNITION");
    await award("T_AIR", "097", "AIR FORCE BASE FACILITY SUPPORT AND AID STATION");
    await tagPrograms({ log: silent });
    const tagged = async (slug: string) =>
      (await q<{ awardId: string }>(`SELECT "awardId" FROM "AwardProgram" WHERE "programSlug" = $1 AND "awardId" LIKE 'T\\_%' ORDER BY 1`, [slug])).map(
        (r) => r.awardId,
      );
    expect(await tagged("drones")).toEqual(["T_UAS"]);
    expect(await tagged("space")).toEqual(["T_NASA", "T_SATNAICS"]);
    expect(await tagged("ai")).toEqual(["T_AI"]);
    // Every award to a confirmed match of a listed ticker (LMT recipients in the fixtures).
    const { rulesToSql } = await import("@/lib/programs/rules");
    const { sql, params } = rulesToSql({ recipientTickers: ["LMT"] });
    const lmt = await q<{ id: string }>(`SELECT a.id FROM "Award" a WHERE ${sql} ORDER BY 1`, params);
    expect(lmt.length).toBeGreaterThan(0);
    const recipients = await q<{ n: number }>(
      `SELECT count(DISTINCT c.ticker)::int AS n FROM "Award" a JOIN "TickerMatch" tm ON tm."recipientId" = a."recipientId"
       JOIN "Company" c ON c.cik = tm."companyCik" WHERE a.id = ANY($1::text[])`,
      [lmt.map((r) => r.id)],
    );
    expect(recipients[0].n).toBe(1);
    await q(`DELETE FROM "Award" WHERE id LIKE 'T\\_%'`);
    await tagPrograms({ log: silent });
  });

  it("grant program directory: per-plan totals, titles, search and detail queries", async () => {
    await rollupSummaries({ log: silent });
    const { listGrantPrograms, getGrantProgram, grantProgramName } = await import("@/lib/programs/grant-programs");
    const all = await listGrantPrograms({ plan: "pro" });
    expect(all.rows.map((r) => r.number)).toEqual(["11.037", "10.051", "47.049"]);
    expect(all.rows[0]).toMatchObject({ title: "CHIPS Incentives Program", total: 500_000_000, publicTotal: 500_000_000, publicCompanies: 1 });
    expect(all.rows[0].agencyName).toBe("Department of Commerce");
    expect((await listGrantPrograms({ plan: "pro", sort: "public" })).rows[0].number).toBe("11.037");
    expect((await listGrantPrograms({ plan: "pro", q: "chips" })).rows.map((r) => r.number)).toEqual(["11.037"]);
    expect((await listGrantPrograms({ plan: "pro", q: "47.0" })).rows.map((r) => r.number)).toEqual(["47.049"]);
    expect((await listGrantPrograms({ plan: "pro", q: "agriculture" })).rows.map((r) => r.number)).toEqual(["10.051"]);
    expect((await listGrantPrograms({ plan: "pro", q: "100%" })).rows).toEqual([]);
    const listing = (await getGrantProgram("47.049"))!;
    expect(grantProgramName(listing)).toBe("Assistance Listing 47.049");
    const companies = await programs.getProgramCompanies({ listing: "11.037" }, realtime);
    expect(companies.confirmed).toMatchObject([{ ticker: "MU", total: 500_000_000 }]);
    expect((await programs.getProgramSummary({ listing: "11.037" }, realtime)).total).toBe(500_000_000);
  });

  it("company rows split new money from reductions", async () => {
    await q(`INSERT INTO "Award" (id, category, "recipientId", "assistanceListing", "totalObligated", "lastModifiedDate", "sourceUrl")
             VALUES ('NEG1', 'GRANT', 'M7XQ1LZ9K2B4', '99.999', -200, '2026-03-01', 'https://www.usaspending.gov/award/NEG1')`);
    await q(`INSERT INTO "AwardTransaction" (id, "awardId", "actionDate", obligation, "availableAt", "lastModifiedDate")
             VALUES ('NEG1_0', 'NEG1', '2026-03-01', 100, '2026-03-02', '2026-03-01'),
                    ('NEG1_1', 'NEG1', '2026-03-05', -300, '2026-03-06', '2026-03-05')`);
    const { confirmed } = await programs.getProgramCompanies({ listing: "99.999" }, realtime);
    expect(confirmed).toMatchObject([{ ticker: "MU", total: -200, added: 100, reduced: -300 }]);
    await q(`DELETE FROM "Award" WHERE id = 'NEG1'`);
  });

  it("lists public companies receiving program funds", async () => {
    const { confirmed, possible } = await programs.getProgramCompanies("chips-act", realtime);
    expect(confirmed).toMatchObject([{ cik: MU, ticker: "MU", total: 500_000_000, added: 500_000_000, reduced: 0, awards: 1 }]);
    expect(possible).toEqual([]);
    const summary = await programs.getProgramSummary("chips-act", realtime);
    expect(summary).toMatchObject({ total: 500_000_000, publicTotal: 500_000_000, awardCount: 1, recipientCount: 1 });
    const [largest] = await programs.getProgramLargestAwards("chips-act", realtime);
    expect(largest).toMatchObject({ ticker: "MU", sourceUrl: expect.stringMatching(/^https:\/\/www\.usaspending\.gov\/award\//) });
    await rollupSummaries({ log: silent });
    expect((await programs.listPrograms("pro")).find((p) => p.slug === "chips-act")).toMatchObject({ publicCompanies: 1, total: "500000000" });
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
