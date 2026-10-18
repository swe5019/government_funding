import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build (`pnpm build` first) and a dedicated
 * database that global setup migrates and resets. Run with `pnpm test:e2e`.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://fedflow:fedflow@localhost:5432/fedflow_e2e";
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Sandboxed machines with a preinstalled Chromium can point at it instead of `playwright install`.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} },
      testMatch: /public\.spec/,
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    // Not /api/health: it answers 503 while data is stale, which Playwright treats as not ready.
    url: `${baseURL}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-use",
      AUTH_TRUST_HOST: "true",
      ADMIN_EMAILS: "admin@e2e.test",
    },
  },
});
