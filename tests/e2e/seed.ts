import path from "node:path";
import { edgarCompanies } from "@/jobs/edgar-companies";
import { matchTickers } from "@/jobs/match-tickers";
import { rollupRecipients } from "@/jobs/rollup";
import { rollupCompanies } from "@/jobs/rollup-companies";
import { closeJobPool, jobPool } from "@/jobs/runner";
import { tagPrograms } from "@/jobs/tag-programs";
import { usaspendingLoadLocal } from "@/jobs/usaspending";
import { E2E_USERS } from "./users";

/**
 * Resets the E2E database and loads the same fixtures the integration tests use, plus
 * one user per tier with a ready-made database session. Run by global-setup.ts with
 * DATABASE_URL/DIRECT_URL pointing at the E2E database (never production).
 */
const fixtures = path.join(import.meta.dirname, "..", "fixtures");
const silent = { info: () => {}, error: () => {} };

async function main() {
  const url = process.env.DIRECT_URL ?? "";
  if (!/e2e|test/i.test(url)) throw new Error(`refusing to reset a database whose URL doesn't mention e2e/test: ${url}`);
  const q = (sql: string, params: unknown[] = []) => jobPool().query(sql, params);

  const { rows } = await q(`SELECT string_agg(format('%I', tablename), ', ') AS t FROM pg_tables
                            WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  await q(`TRUNCATE ${rows[0].t} CASCADE`);

  for (const f of ["All_Contracts_PrimeTransactions_sample_1.csv", "All_Assistance_PrimeTransactions_sample_1.csv"]) {
    await usaspendingLoadLocal(path.join(fixtures, f), { log: silent });
  }
  await edgarCompanies({ file: path.join(fixtures, "company_tickers_exchange.json"), log: silent });
  await rollupRecipients({ full: true, log: silent });
  await tagPrograms({ log: silent });
  await matchTickers({ full: true, log: silent });
  await rollupCompanies({ log: silent });

  const expires = new Date(Date.now() + 86_400_000);
  for (const u of Object.values(E2E_USERS)) {
    await q(
      `INSERT INTO "User" (id, email, "emailVerified", role, "acceptedDisclaimerAt", "updatedAt")
       VALUES ($1, $2, now(), $3::"Role", now(), now())`,
      [u.id, u.email, u.role],
    );
    await q(`INSERT INTO "Session" ("sessionToken", "userId", expires) VALUES ($1, $2, $3)`, [u.sessionToken, u.id, expires]);
    if (u.pro) {
      await q(
        `INSERT INTO "Subscription" ("stripeSubscriptionId", "userId", "planKey", interval, status, "currentPeriodEnd", "updatedAt")
         VALUES ($1, $2, 'pro', 'month', 'active', $3, now())`,
        [`sub_e2e_${u.id}`, u.id, new Date(Date.now() + 30 * 86_400_000)],
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeJobPool());
