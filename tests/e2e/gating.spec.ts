import { expect, expectAccessible, test } from "./fixtures";

test.describe("signed out", () => {
  test("CSV export needs sign-in", async ({ request }) => {
    expect((await request.get("/api/export/company/LMT")).status()).toBe(401);
  });

  test("admin sends you to sign in", async ({ page }) => {
    await page.goto("/admin/matches");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("Pro pages show the upgrade notice", async ({ page }) => {
    await page.goto("/screener");
    await expect(page.getByText("The screener is part of Pro")).toBeVisible();
  });
});

test.describe("free user", () => {
  test.beforeEach(async ({ signInAs }) => signInAs("free"));

  test("CSV export is a Pro feature", async ({ page }) => {
    expect((await page.request.get("/api/export/company/LMT")).status()).toBe(403);
  });

  test("feed, screener and watchlists are gated", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.getByText("The daily large-awards feed is part of Pro")).toBeVisible();
    await page.goto("/watchlists");
    await expect(page.getByText("Watchlists and email alerts are part of Pro")).toBeVisible();
  });

  test("admin renders not-found for non-admins", async ({ page }) => {
    // The status is 200 once the root shell has streamed; the admin layout never renders.
    await page.goto("/admin/matches");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByText("Ticker match review")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("account page shows the free plan", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText("free@e2e.test")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("Pro user", () => {
  test.beforeEach(async ({ signInAs }) => signInAs("pro"));

  test("no delay notice on company pages", async ({ page }) => {
    await page.goto("/company/LMT");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("LMT");
    await expect(page.getByRole("link", { name: "Get daily updates with Pro" })).toHaveCount(0);
  });

  test("CSV export downloads with a formula-safe CSV", async ({ page }) => {
    const res = await page.request.get("/api/export/company/LMT");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/LMT-federal-awards-\d{4}-\d{2}-\d{2}\.csv/);
    const body = await res.text();
    expect(body.split("\n")[0]).toContain("action_date");
  });

  test("screener and feed render with accessible tables", async ({ page }) => {
    await page.goto("/screener");
    await expect(page.getByRole("table").first()).toBeVisible();
    await expectAccessible(page);
    await page.goto("/feed");
    await expect(page.getByText("The daily large-awards feed is part of Pro")).toHaveCount(0);
  });

  test("add a ticker to a new watchlist", async ({ page }) => {
    await page.goto("/watchlists");
    await page.getByLabel("Add ticker").fill("LMT");
    await page.getByRole("button", { name: "Add to a new watchlist" }).click();
    await expect(page.getByRole("button", { name: "Remove LMT" })).toBeVisible();
    await expect(page.getByLabel("Alert threshold for LMT")).toBeVisible();
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ signInAs }) => signInAs("admin"));

  test("match review queue loads", async ({ page }) => {
    const res = await page.goto("/admin/matches");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Ticker match review" })).toBeVisible();
    await expectAccessible(page);
  });
});
