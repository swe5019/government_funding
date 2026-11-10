import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Pro waitlist storage and the "lite" (large awards only) history load. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const silent = { info: () => {}, error: () => {} };

describe.skipIf(!url)("demand test features (integration)", async () => {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const { prisma } = await import("@/lib/db");
  const { closeJobPool } = await import("@/jobs/runner");
  const { joinWaitlist, getWaitlistSummary } = await import("@/lib/waitlist");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { getLiteHistoryMinimum } = await import("@/lib/recipients");

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "WaitlistEntry", "AwardProgram", "TickerMatch", "AwardTransaction", "Award", "Recipient", "IngestionRun" CASCADE`,
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await closeJobPool();
  });

  it("stores one waitlist entry per email and summarizes answers and sources", async () => {
    await joinWaitlist({ email: "A@Example.com", priceAnswer: null, source: "pricing", userId: null });
    await joinWaitlist({ email: "a@example.com", priceAnswer: "19", source: "feature:feed", userId: null }); // same person
    await joinWaitlist({ email: "b@example.com", priceAnswer: "0", source: "feature:feed", userId: null });
    const s = await getWaitlistSummary();
    expect(s.total).toBe(2);
    expect(s.last7Days).toBe(2);
    expect(s.byPrice).toEqual({ "0": 1, "10": 0, "19": 1, "29+": 0, skipped: 0 });
    expect(s.bySource).toEqual(expect.arrayContaining([{ source: "pricing", n: 1 }, { source: "feature:feed", n: 1 }]));
    expect(s.recent.map((r) => r.email).sort()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("lite loads keep only awards at or above the minimum", async () => {
    await usaspendingLoadLocal(path.join(fixtures, "All_Contracts_PrimeTransactions_sample_1.csv"), { minAwardUsd: 100_000_000, log: silent });
    const awards = await prisma.award.findMany({ select: { totalObligated: true } });
    expect(awards.length).toBeGreaterThan(0);
    for (const a of awards) expect(Math.abs(Number(a.totalObligated))).toBeGreaterThanOrEqual(100_000_000);
    const run = await prisma.ingestionRun.findFirst({ where: { job: "usaspending_file" }, orderBy: { startedAt: "desc" } });
    expect(run?.rowsSkipped).toBeGreaterThan(0);
  });

  it("the history note appears once a lite backfill chunk has succeeded", async () => {
    expect(await getLiteHistoryMinimum()).toBeNull();
    await prisma.ingestionRun.create({
      data: { job: "usaspending_backfill", chunkKey: "contracts:2025-03:min1000000", params: {}, status: "SUCCEEDED" },
    });
    expect(await getLiteHistoryMinimum()).toBe(1_000_000);
  });
});
