import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Loads fixture files into a real Postgres. Needs TEST_DATABASE_URL pointing at a migrated,
 * disposable database (CI provides one). Skipped otherwise.
 */
const url = process.env.TEST_DATABASE_URL;
const fixtures = path.join(__dirname, "..", "fixtures");
const CONTRACTS = path.join(fixtures, "All_Contracts_PrimeTransactions_sample_1.csv");
const ASSISTANCE = path.join(fixtures, "All_Assistance_PrimeTransactions_sample_1.csv");
const silent = { info: () => {}, error: () => {} };

describe.skipIf(!url)("USAspending ingestion (integration)", async () => {
  process.env.DIRECT_URL = url;
  process.env.DATABASE_URL = url;
  const { jobPool, closeJobPool, runChunk, withJobLock } = await import("@/jobs/runner");
  const { usaspendingLoadLocal } = await import("@/jobs/usaspending");
  const { rollupRecipients } = await import("@/jobs/rollup");
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await jobPool().query(sql, params)).rows as T[];
  const count = async (table: string) => Number((await q<{ n: string }>(`SELECT count(*) n FROM "${table}"`))[0].n);

  beforeAll(async () => {
    await q(`TRUNCATE "AwardTransaction", "Award", "RecipientAwardMonthly", "Recipient", "SubAgency", "Agency",
             "IngestionRun", "DataFreshness" CASCADE`);
  });
  afterAll(closeJobPool);

  it("loads a file and is idempotent on reload", async () => {
    await usaspendingLoadLocal(CONTRACTS, { log: silent });
    const first = { tx: await count("AwardTransaction"), awards: await count("Award"), recips: await count("Recipient") };
    expect(first).toEqual({ tx: 4, awards: 3, recips: 3 });

    await usaspendingLoadLocal(CONTRACTS, { log: silent });
    expect({ tx: await count("AwardTransaction"), awards: await count("Award"), recips: await count("Recipient") }).toEqual(first);

    const runs = await q<{ rowsUpserted: number; rowsSkipped: number }>(
      `SELECT "rowsUpserted", "rowsSkipped" FROM "IngestionRun" WHERE job = 'usaspending_file' ORDER BY "startedAt"`,
    );
    expect(runs.map((r) => r.rowsUpserted)).toEqual([4, 0]);
    expect(runs.every((r) => r.rowsSkipped === 1)).toBe(true);
    const [fresh] = await q<{ dataThrough: Date }>(`SELECT "dataThrough" FROM "DataFreshness" WHERE source = 'usaspending'`);
    expect(fresh.dataThrough.toISOString().slice(0, 10)).toBe("2026-05-05");
  });

  it("ignores an older version of a record", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fedflow-test-"));
    const stale = path.join(dir, "stale.csv");
    await writeFile(
      stale,
      [
        "contract_transaction_unique_key,contract_award_unique_key,federal_action_obligation,action_date,recipient_uei,recipient_name,last_modified_date",
        "5700_-NONE-_FA862526C0042_0_-NONE-_0,CONT_AWD_FA862526C0042_5700_-NONE-_-NONE-,1.00,2026-03-18,HJ7KQFRMYN63,SIKORSKY,2026-01-01",
      ].join("\n"),
    );
    await usaspendingLoadLocal(stale, { kind: "contracts", log: silent });
    const [tx] = await q<{ obligation: string }>(
      `SELECT obligation FROM "AwardTransaction" WHERE id = '5700_-NONE-_FA862526C0042_0_-NONE-_0'`,
    );
    expect(tx.obligation).toBe("48500000.00");
  });

  it("hides newly published records from the DELAYED (free) view", async () => {
    await usaspendingLoadLocal(ASSISTANCE, { incremental: true, log: silent });
    await rollupRecipients({ full: true, log: silent });
    const rows = await q<{ view: string; total: string }>(
      `SELECT view, sum(obligated)::text total FROM "RecipientAwardMonthly" WHERE "recipientId" = 'M7XQ1LZ9K2B4' GROUP BY view`,
    );
    expect(rows).toEqual([{ view: "REALTIME", total: "500000000.00" }]);

    // Backfilled contract data (published months ago) is in both views.
    const lm = await q<{ view: string }>(
      `SELECT DISTINCT view FROM "RecipientAwardMonthly" WHERE "recipientId" = 'ZFN2JJXBLZT3' ORDER BY view`,
    );
    expect(lm.map((r) => r.view)).toEqual(["REALTIME", "DELAYED"]);
  });

  it("incremental rollup picks up records once they age past the delay", async () => {
    await q(`UPDATE "AwardTransaction" SET "availableAt" = now() - interval '30 days' WHERE id = '1341_CHIPS0001_-NONE-_0'`);
    // Backdate the previous rollup so the aged record falls inside the incremental window.
    await q(`UPDATE "IngestionRun" SET "startedAt" = now() - interval '25 days' WHERE job = 'rollup_recipients'`);
    await rollupRecipients({ log: silent });
    const rows = await q<{ view: string }>(
      `SELECT view FROM "RecipientAwardMonthly" WHERE "recipientId" = 'M7XQ1LZ9K2B4' ORDER BY view`,
    );
    expect(rows.map((r) => r.view)).toEqual(["REALTIME", "DELAYED"]);
  });

  it("logs every failed attempt and rethrows", async () => {
    await expect(
      runChunk({ job: "test_fail", chunkKey: "x", params: {}, attempts: 2, baseDelayMs: 1, log: silent }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const runs = await q<{ status: string; attempt: number; error: string }>(
      `SELECT status, attempt, error FROM "IngestionRun" WHERE job = 'test_fail' ORDER BY attempt`,
    );
    expect(runs.map((r) => [r.status, r.attempt])).toEqual([["FAILED", 1], ["FAILED", 2]]);
    expect(runs[0].error).toContain("boom");
  });

  it("skips chunks that already succeeded", async () => {
    let calls = 0;
    const opts = { job: "test_skip", chunkKey: "c1", params: {}, log: silent };
    await runChunk(opts, async () => void calls++);
    const second = await runChunk(opts, async () => void calls++);
    expect(second.status).toBe("skipped");
    expect(calls).toBe(1);
  });

  it("prevents overlapping runs of the same job", async () => {
    await withJobLock("test-lock", async () => {
      await expect(withJobLock("test-lock", async () => {})).rejects.toThrow(/already running/);
    });
  });
});
