import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** DoD, SAM.gov notices, Federal Register and EDGAR filings jobs with fixture fetchers. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const fx = (f: string) => readFileSync(path.join(fixtures, f), "utf8");
const silent = { info: () => {}, error: () => {} };
const LMT = "0000936468";

describe.skipIf(!url)("Phase 6 sources (integration)", async () => {
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = url;
  const { jobPool, closeJobPool } = await import("@/jobs/runner");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { rollupRecipients } = await import("@/jobs/rollup");
  const { edgarCompanies } = await import("@/jobs/edgar-companies");
  const { matchTickers } = await import("@/jobs/match-tickers");
  const { rollupCompanies } = await import("@/jobs/rollup-companies");
  const { dodAnnouncements } = await import("@/jobs/dod-announcements");
  const { samOpportunities } = await import("@/jobs/sam-opportunities");
  const { federalRegister } = await import("@/jobs/federal-register");
  const { edgarFilings } = await import("@/jobs/edgar-filings");
  const { getAnnouncements, getContractFilings, getProgramDocuments } = await import("@/lib/announcements");
  const { normalizeName } = await import("@/lib/mapping/normalize");
  const { prisma } = await import("@/lib/db");
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await jobPool().query(sql, params)).rows as T[];

  beforeAll(async () => {
    await q(`TRUNCATE "DodAnnouncement", "SamAwardNotice", "FederalRegisterDoc", "SecFiling", "AlertDelivery", "WatchlistItem",
             "Watchlist", "Subscription", "User", "PriceBar", "AwardProgram", "Program", "TickerMatch", "CompanyAwardMonthly",
             "CompanyAlias", "Company", "AuditLog", "AwardTransaction", "Award", "RecipientAwardMonthly", "Recipient",
             "SubAgency", "Agency", "IngestionRun", "DataFreshness" CASCADE`);
    for (const f of ["All_Contracts_PrimeTransactions_sample_1.csv", "All_Assistance_PrimeTransactions_sample_1.csv"]) {
      await usaspendingLoadLocal(path.join(fixtures, f), { log: silent });
    }
    await edgarCompanies({ file: path.join(fixtures, "company_tickers_exchange.json"), log: silent });
    await rollupRecipients({ full: true, log: silent });
    await matchTickers({ full: true, log: silent });
    await rollupCompanies({ log: silent });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await closeJobPool();
  });

  it("DoD announcements: parsed, idempotent, linked by contract number", async () => {
    const opts = { file: path.join(fixtures, "dod", "contracts-page.html"), url: "https://www.defense.gov/x/1", date: "2026-10-16", log: silent };
    await dodAnnouncements(opts);
    await dodAnnouncements(opts);
    const rows = await q<{ contractorName: string; recipientId: string | null }>(
      `SELECT "contractorName", "recipientId" FROM "DodAnnouncement" ORDER BY "contractorName"`,
    );
    expect(rows).toEqual([
      { contractorName: "Example Shipbuilding LLC", recipientId: null },
      { contractorName: "Lockheed Martin Corp.", recipientId: "ZFN2JJXBLZT3" },
      { contractorName: "Sikorsky Aircraft Corp.", recipientId: "HJ7KQFRMYN63" },
    ]);
  });

  it("DoD announcements: a blocked page (403) falls back to feed content or is skipped without failing", async () => {
    const { HttpError } = await import("@/lib/sources/http");
    const para = "Acme Corp., Austin, Texas, is awarded a $9,000,000 contract (W912DY-26-C-0001). Army Corps, Huntsville, Alabama, is the contracting activity.";
    const rss = `<rss><channel>
      <item><title>Contracts For Oct. 20, 2026</title><link>https://www.war.gov/x/20</link><description>&lt;p&gt;${para}&lt;/p&gt;</description></item>
      <item><title>Contracts For Oct. 21, 2026</title><link>https://www.war.gov/x/21</link></item>
    </channel></rss>`;
    const before = await q(`SELECT "lastSuccessfulAt" FROM "DataFreshness" WHERE source = 'dod'`);
    const res = await dodAnnouncements({
      log: silent,
      fetchers: {
        rss: async () => rss,
        page: async (u) => {
          throw new HttpError(403, `GET ${u} -> 403`);
        },
      },
    });
    expect(res).toEqual({ blocked: 1 });
    expect(await q(`SELECT "contractorName", url FROM "DodAnnouncement" WHERE url LIKE 'https://www.war.gov/%'`)).toEqual([
      { contractorName: "Acme Corp.", url: "https://www.war.gov/x/20" },
    ]);
    expect(await q(`SELECT "lastSuccessfulAt" FROM "DataFreshness" WHERE source = 'dod'`)).toEqual(before);
    await q(`DELETE FROM "DodAnnouncement" WHERE url LIKE 'https://www.war.gov/%'`);
  });

  it("SAM.gov award notices: stored and linked by awardee UEI", async () => {
    await samOpportunities({
      log: silent,
      fetchPage: async () => ({
        totalRecords: 2,
        opportunitiesData: [
          {
            noticeId: "n1",
            title: "HH-60W spares",
            postedDate: new Date().toISOString().slice(0, 10),
            award: { amount: "2500000", awardee: { name: "SIKORSKY AIRCRAFT CORPORATION", ueiSAM: "HJ7KQFRMYN63" } },
          },
          { noticeId: "n2", title: "Unrelated", postedDate: new Date().toISOString().slice(0, 10), award: { awardee: { ueiSAM: "NOTLOADED123" } } },
        ],
      }),
    });
    expect(await q(`SELECT "noticeId", "recipientId" FROM "SamAwardNotice" ORDER BY 1`)).toEqual([
      { noticeId: "n1", recipientId: "HJ7KQFRMYN63" },
      { noticeId: "n2", recipientId: null },
    ]);
  });

  it("company announcements combine DoD and SAM.gov, with the free-tier delay applied", async () => {
    // Announcement dates are in the fixture (Oct 2026); look back far enough to include them.
    const all = await getAnnouncements(LMT, { days: 3650, availableBefore: null });
    expect(all.map((a) => [a.source, a.recipientName]).sort()).toEqual([
      ["DoD", "Lockheed Martin Corp."],
      ["DoD", "Sikorsky Aircraft Corp."],
      ["SAM.gov", "SIKORSKY AIRCRAFT CORPORATION"],
    ]);
    expect(await getAnnouncements(LMT, { days: 3650, availableBefore: new Date(Date.now() - 7 * 86_400_000) })).toEqual([]);
    expect((await getAnnouncements(null, { days: 3650, availableBefore: null, minUsd: 100_000_000 })).map((a) => a.recipientName)).toEqual([
      "Lockheed Martin Corp.",
    ]);
  });

  it("Federal Register documents are stored per program", async () => {
    const fetchPage = async () => ({
      count: 1,
      results: [
        {
          document_number: "2026-12345",
          title: "CHIPS Incentives Program: Notice of Funding Opportunity",
          type: "Notice",
          abstract: "NIST announces...",
          publication_date: "2026-10-01",
          html_url: "https://www.federalregister.gov/d/2026-12345",
          agencies: [{ name: "National Institute of Standards and Technology" }],
        },
      ],
    });
    await federalRegister({ log: silent, since: "2026-09-01", fetchPage });
    await federalRegister({ log: silent, since: "2026-09-01", fetchPage });
    const docs = await getProgramDocuments("chips-act");
    expect(docs.map((d) => [d.documentNumber, d.agencyNames])).toEqual([["2026-12345", ["National Institute of Standards and Technology"]]]);
  });

  it("EDGAR: screens 8-Ks, loads Exhibit 21 subsidiaries once per 10-K, and the matcher uses them", async () => {
    const sub = JSON.parse(fx("edgar/submissions-lmt.json"));
    // Make the fixture's dates relative to today so the lookback windows apply.
    const today = new Date().toISOString().slice(0, 10);
    sub.filings.recent.filingDate = [today, today, today, "2020-01-01"];
    const texts: Record<string, string> = {
      "https://www.sec.gov/Archives/edgar/data/936468/000093646826000101/lmt-20261010.htm": fx("edgar/8k-contract.htm"),
      "https://www.sec.gov/Archives/edgar/data/936468/000093646826000012/0000936468-26-000012-index.htm": fx("edgar/10k-index.htm"),
      "https://www.sec.gov/Archives/edgar/data/936468/000093646826000012/lmt-ex21.htm": fx("edgar/ex21.htm"),
    };
    let fetches = 0;
    const fetchers = {
      submissions: async (cik: string) => (cik === LMT ? sub : { cik, name: "OTHER" }),
      text: async (u: string) => {
        fetches++;
        if (!(u in texts)) throw new Error(`unexpected fetch ${u}`);
        return texts[u];
      },
    };
    await edgarFilings({ log: silent, fetchers });
    const filings = await getContractFilings(LMT);
    expect(filings.map((f) => [f.accession, f.matchedTerms.includes("U.S. Navy")])).toEqual([["0000936468-26-000101", true]]);
    const aliases = await q<{ alias: string }>(`SELECT alias FROM "CompanyAlias" WHERE source = 'EX21_SUBSIDIARY' ORDER BY 1`);
    expect(aliases.map((a) => a.alias)).toEqual(["Example Rotorcraft Services, Inc.", "Lockheed Martin Space Systems LLC", "Sikorsky Aircraft Corporation"]);

    const before = fetches;
    await edgarFilings({ log: silent, fetchers });
    expect(fetches).toBe(before); // nothing new: 8-K already screened, 10-K already processed

    // A recipient with no parent link, named like a listed subsidiary, now matches LMT.
    await q(
      `INSERT INTO "Recipient" (id, uei, name, "normalizedName", "recipientType", "updatedAt")
       VALUES ('LMSPACE00001', 'LMSPACE00001', 'EXAMPLE ROTORCRAFT SERVICES INC', $1, 'BUSINESS', now())`,
      [normalizeName("EXAMPLE ROTORCRAFT SERVICES INC")],
    );
    await q(`INSERT INTO "Award" (id, category, "recipientId", "totalObligated", "lastModifiedDate", "sourceUrl")
             VALUES ('AWD_ERS', 'CONTRACT', 'LMSPACE00001', 3000000, '2026-03-01', 'https://www.usaspending.gov/award/AWD_ERS')`);
    await q(`INSERT INTO "AwardTransaction" (id, "awardId", "actionDate", obligation, "availableAt", "lastModifiedDate")
             VALUES ('TX_ERS', 'AWD_ERS', '2026-03-01', 3000000, '2026-03-02', '2026-03-01')`);
    await rollupRecipients({ full: true, log: silent });
    await matchTickers({ log: silent }); // edgar_subsidiaries marker forces a full re-match
    const [m] = await q<{ companyCik: string; confidence: number; method: string }>(
      `SELECT "companyCik", confidence, method::text FROM "TickerMatch" WHERE "recipientId" = 'LMSPACE00001'`,
    );
    expect(m).toEqual({ companyCik: LMT, confidence: 0.9, method: "ALIAS" });
  });
});
