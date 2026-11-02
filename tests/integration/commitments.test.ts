import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Resolving announced commitments against tracked companies. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("announced commitments (integration)", async () => {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const { prisma } = await import("@/lib/db");
  const { getCommitments } = await import("@/lib/commitments");

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Company" CASCADE`);
    await prisma.company.create({ data: { cik: "0000000101", ticker: "QNT", tickers: ["QNT"], name: "Quantinuum, Inc." } });
    // Tracked under a different primary ticker: links go to the primary.
    await prisma.company.create({ data: { cik: "0000000102", ticker: "RGTI", tickers: ["RGTI", "RGTIW"], name: "Rigetti Computing, Inc." } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("program view lists every recipient and links only tracked tickers", async () => {
    const [c] = await getCommitments({ program: "quantum" });
    expect(c.totalUsd).toBe(2_013_000_000);
    const by = Object.fromEntries(c.recipients.map((r) => [r.name, r.companyTicker]));
    expect(by).toMatchObject({ Quantinuum: "QNT", "Rigetti Computing": "RGTI", IBM: null, PsiQuantum: null });
    expect(await getCommitments({ program: "no-such-program" })).toEqual([]);
  });

  it("company view keeps only that company's line, matched by any of its tickers", async () => {
    const [c] = await getCommitments({ tickers: ["QNT"] });
    expect(c.recipients).toEqual([expect.objectContaining({ name: "Quantinuum", amountUsd: 100_000_000, companyTicker: "QNT" })]);
    expect(await getCommitments({ tickers: ["LMT"] })).toEqual([]);
  });
});
