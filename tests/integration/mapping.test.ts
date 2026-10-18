import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Recipient -> ticker mapping against a real Postgres. Needs TEST_DATABASE_URL (see usaspending-ingest.test.ts). */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const silent = { info: () => {}, error: () => {} };

const LMT = "0000936468";
const MU = "0000723125";
const EXLB = "0009990002";

describe.skipIf(!url)("ticker mapping (integration)", async () => {
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = url;
  const { jobPool, closeJobPool } = await import("@/jobs/runner");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { rollupRecipients } = await import("@/jobs/rollup");
  const { edgarCompanies } = await import("@/jobs/edgar-companies");
  const { matchTickers } = await import("@/jobs/match-tickers");
  const { rollupCompanies } = await import("@/jobs/rollup-companies");
  const { applyDecision, findCompanyByTicker } = await import("@/lib/admin/matches");
  const { prisma } = await import("@/lib/db");

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await jobPool().query(sql, params)).rows as T[];
  const match = async (id: string) =>
    (await q<{ companyCik: string | null; confidence: number; method: string; status: string; parentRecipientId: string }>(
      `SELECT "companyCik", confidence, method::text, status::text, "parentRecipientId" FROM "TickerMatch" WHERE "recipientId" = $1`,
      [id],
    ))[0];
  const companyTotal = async (cik: string, includesPossible: boolean) =>
    Number(
      (await q<{ t: string | null }>(
        `SELECT SUM(obligated)::text t FROM "CompanyAwardMonthly" WHERE "companyCik" = $1 AND view = 'REALTIME'
           AND "agencyCode" = 'ALL' AND category = 'ALL' AND "includesPossible" = $2`,
        [cik, includesPossible],
      ))[0].t ?? 0,
    );

  /** Add a recipient with one award of `amount`, published long ago. */
  async function addRecipient(id: string, name: string, amount: number, parentUei: string | null = null) {
    const norm = (await import("@/lib/mapping/normalize")).normalizeName(name);
    await q(
      `INSERT INTO "Recipient" (id, uei, name, "normalizedName", "parentUei", "recipientType", "updatedAt")
       VALUES ($1, $1, $2, $3, $4, 'BUSINESS', now())`,
      [id, name, norm, parentUei],
    );
    await q(
      `INSERT INTO "Award" (id, category, "recipientId", "totalObligated", "lastModifiedDate", "sourceUrl")
       VALUES ($1, 'CONTRACT', $2, $3, '2026-03-01', 'https://www.usaspending.gov/award/' || $1)`,
      [`AWD_${id}`, id, amount],
    );
    await q(
      `INSERT INTO "AwardTransaction" (id, "awardId", "actionDate", obligation, "availableAt", "lastModifiedDate")
       VALUES ($1, $2, '2026-03-01', $3, '2026-03-02', '2026-03-01')`,
      [`TX_${id}`, `AWD_${id}`, amount],
    );
  }

  const run = async (full = false) => {
    await rollupRecipients({ full: true, log: silent });
    await matchTickers({ full, log: silent });
    await rollupCompanies({ log: silent });
  };

  beforeAll(async () => {
    await q(`TRUNCATE "TickerMatch", "CompanyAwardMonthly", "CompanyAlias", "Company", "AuditLog", "AwardTransaction", "Award",
             "RecipientAwardMonthly", "Recipient", "SubAgency", "Agency", "IngestionRun", "DataFreshness" CASCADE`);
    for (const f of ["All_Contracts_PrimeTransactions_sample_1.csv", "All_Assistance_PrimeTransactions_sample_1.csv"]) {
      await usaspendingLoadLocal(path.join(fixtures, f), { log: silent });
    }
    await edgarCompanies({ file: path.join(fixtures, "company_tickers_exchange.json"), log: silent });
    await addRecipient("SMALLBA00001", "BOEING CO", 500_000); // below the $1M threshold
    await addRecipient("EXLABS000001", "EXAMPLE LABS INC", 5_000_000); // two similar public companies
    await run(true);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await closeJobPool();
  });

  it("matches exact names and rolls subsidiaries up to their parent", async () => {
    expect(await match("ZFN2JJXBLZT3")).toMatchObject({ companyCik: LMT, confidence: 0.97, method: "EXACT_NAME", status: "PENDING" });
    expect(await match("HJ7KQFRMYN63")).toMatchObject({
      companyCik: LMT,
      confidence: 0.951,
      method: "UEI_PARENT_ROLLUP",
      parentRecipientId: "ZFN2JJXBLZT3",
    });
    expect(await match("M7XQ1LZ9K2B4")).toMatchObject({ companyCik: MU, method: "EXACT_NAME" });
  });

  it("skips OTC companies, non-businesses and recipients under the dollar threshold", async () => {
    expect(await match("QW1ERT2YUI34")).toBeUndefined(); // ACME SPACE SYSTEMS -> OTC only
    expect(await match("K1LMN2OPQ3RS")).toBeUndefined(); // university
    expect(await match("SMALLBA00001")).toBeUndefined();
  });

  it("keeps ambiguous matches as 'possible' and out of confirmed totals", async () => {
    const m = await match("EXLABS000001");
    expect(m.confidence).toBeLessThan(0.85);
    expect(m.status).toBe("PENDING");
    expect(await companyTotal(m.companyCik!, false)).toBe(0);
    expect(await companyTotal(m.companyCik!, true)).toBe(5_000_000);
  });

  it("sums confirmed company totals from all linked recipients", async () => {
    expect(await companyTotal(LMT, false)).toBe(1_250_000_000 + 150_000_000 + 48_500_000);
  });

  it("a correction confirms the reviewer's company and survives a full re-match", async () => {
    const exlb = await findCompanyByTicker("exlb");
    expect(exlb?.cik).toBe(EXLB);
    await applyDecision({ groupId: "EXLABS000001" }, { kind: "correct", companyCik: EXLB }, { id: null, email: "tester@example.com" });
    await run(true);
    expect(await match("EXLABS000001")).toMatchObject({ companyCik: EXLB, status: "CORRECTED", method: "MANUAL", confidence: 1 });
    expect(await companyTotal(EXLB, false)).toBe(5_000_000);
    const [log] = await q<{ action: string }>(`SELECT action FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 1`);
    expect(log.action).toBe("ticker_match.correct");
  });

  it("rejecting a parent group removes the link for its subsidiaries too, and stays rejected", async () => {
    await applyDecision({ groupId: "ZFN2JJXBLZT3" }, { kind: "reject" }, { id: null, email: "tester@example.com" });
    expect((await match("HJ7KQFRMYN63")).status).toBe("REJECTED");
    expect(await companyTotal(LMT, true)).toBe(0);

    await run(true);
    expect((await match("ZFN2JJXBLZT3")).status).toBe("REJECTED");
    expect((await match("HJ7KQFRMYN63")).status).toBe("REJECTED");
    expect(await companyTotal(LMT, true)).toBe(0);
  });

  it("new subsidiaries of an approved parent inherit the reviewer's decision", async () => {
    await applyDecision({ groupId: "M7XQ1LZ9K2B4" }, { kind: "approve" }, { id: null, email: "tester@example.com" });
    await addRecipient("MUSUB0000001", "MICRON IDAHO FAB LLC", 2_000_000, "M7XQ1LZ9K2B4");
    await run();
    expect(await match("MUSUB0000001")).toMatchObject({ companyCik: MU, method: "UEI_PARENT_ROLLUP", confidence: 0.98 });
    expect(await companyTotal(MU, false)).toBe(502_000_000);
  });

  it("reopening returns rows to automatic matching", async () => {
    await applyDecision({ groupId: "ZFN2JJXBLZT3" }, { kind: "reopen" }, { id: null, email: "tester@example.com" });
    await run(true);
    expect(await match("ZFN2JJXBLZT3")).toMatchObject({ status: "PENDING", companyCik: LMT, confidence: 0.97 });
    expect(await companyTotal(LMT, false)).toBeGreaterThan(0);
  });
});
