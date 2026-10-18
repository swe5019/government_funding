import { execSync } from "node:child_process";
import { E2E_DATABASE_URL } from "../../playwright.config";

/** Migrate and reseed the E2E database before the run. */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL, DIRECT_URL: E2E_DATABASE_URL };
  execSync("pnpm exec prisma migrate deploy", { env, stdio: "inherit" });
  execSync("pnpm exec tsx tests/e2e/seed.ts", { env, stdio: "inherit" });
}
