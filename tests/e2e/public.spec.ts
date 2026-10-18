import { siteConfig } from "@/config/site";
import { expect, expectAccessible, test } from "./fixtures";

const PAGES = ["/", "/search?q=lockheed", "/company/LMT", "/programs", "/program/chips-act", "/pricing", "/signin", "/disclaimer"];

for (const path of PAGES) {
  test(`${path} renders with the disclaimer and passes axe`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Not investment advice.").first()).toBeVisible();
    await expectAccessible(page);
  });
}

test("company page shows source links, last updated and the free-tier delay", async ({ page }) => {
  await page.goto("/company/LMT");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("LMT");
  await expect(page.getByText(/Last updated/).first()).toBeVisible();
  await expect(page.locator('a[href^="https://www.usaspending.gov/award/"]').first()).toBeAttached();
  await expect(page.getByRole("link", { name: "Get daily updates with Pro" }).first()).toBeVisible();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/company\/LMT$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld["@type"]).toBe("Dataset");
});

test("search finds a company by recipient name", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox").first().fill("lockheed");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=lockheed/);
  await expect(page.getByRole("link", { name: /LMT/ }).first()).toBeVisible();
});

test("unknown company shows not-found with a search box and noindex", async ({ page }) => {
  // Streamed pages keep the 200 already sent; Next marks the not-found render noindex.
  await page.goto("/company/NOPE123");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.locator("main").getByRole("searchbox")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

test("robots, sitemap and the Open Graph image are served", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Sitemap:");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/company/LMT</loc>");
  expect(sitemap).toContain("/program/chips-act</loc>");
  const og = await request.get("/opengraph-image");
  expect(og.headers()["content-type"]).toBe("image/png");
  expect(siteConfig.name.length).toBeGreaterThan(0);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
