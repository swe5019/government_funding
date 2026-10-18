import { describe, expect, it } from "vitest";
import { plans } from "@/config/plans";
import { adminEmails, isAdminEmail } from "@/lib/auth/admins";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { tooManyLinks } from "@/lib/auth/throttle";
import { entitlementsFor, planFor } from "@/lib/billing/entitlements";
import { planForPriceId, priceIdFor } from "@/lib/billing/prices";

const now = new Date("2026-10-18T12:00:00Z");
const sub = (status: string, endsInDays = 10, planKey = "pro") => ({
  planKey,
  status,
  currentPeriodEnd: new Date(now.getTime() + endsInDays * 86_400_000),
});

describe("planFor", () => {
  it.each([
    ["trialing", "pro"],
    ["active", "pro"],
    ["past_due", "pro"],
    ["canceled", "free"],
    ["incomplete", "free"],
    ["incomplete_expired", "free"],
    ["unpaid", "free"],
    ["paused", "free"],
  ])("%s -> %s", (status, plan) => {
    expect(planFor(sub(status), now)).toBe(plan);
  });

  it("drops to free once the period has ended (after a 1-day grace)", () => {
    expect(planFor(sub("active", -0.5), now)).toBe("pro");
    expect(planFor(sub("active", -2), now)).toBe("free");
  });

  it("treats no subscription or an unknown plan as free", () => {
    expect(planFor(null, now)).toBe("free");
    expect(planFor(sub("active", 10, "enterprise"), now)).toBe("free");
    expect(entitlementsFor(null, now)).toBe(plans.free.entitlements);
    expect(entitlementsFor(sub("active"), now).dataDelayDays).toBe(0);
  });
});

describe("prices", () => {
  const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_ANNUAL: "price_y" };
  it("maps plan/interval to price IDs and back", () => {
    expect(priceIdFor("pro", "monthly", env)).toBe("price_m");
    expect(planForPriceId("price_y", env)).toEqual({ plan: "pro", interval: "annual" });
    expect(planForPriceId("price_other", env)).toBeNull();
  });
  it("recognizes legacy prices kept for existing subscribers", () => {
    expect(planForPriceId("price_old", { ...env, STRIPE_PRICE_PRO_LEGACY: "price_older, price_old" })).toEqual({ plan: "pro", interval: null });
  });
  it("fails clearly when a price env var is missing", () => {
    expect(() => priceIdFor("pro", "annual", {})).toThrow(/STRIPE_PRICE_PRO_ANNUAL/);
    expect(() => priceIdFor("free", "monthly", env)).toThrow(/no monthly price/);
  });
});

describe("admin emails", () => {
  it("parses comma/space separated, case-insensitive lists", () => {
    expect([...adminEmails(" A@x.com, b@Y.com;c@z.com  not-an-email ")]).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(isAdminEmail("B@y.COM", "a@x.com,b@y.com")).toBe(true);
    expect(isAdminEmail("d@x.com", "a@x.com")).toBe(false);
    expect(isAdminEmail(null, "a@x.com")).toBe(false);
    expect(isAdminEmail("a@x.com", "")).toBe(false);
  });
});

describe("auth helpers", () => {
  it("throttles the 4th live magic link", () => {
    expect(tooManyLinks(3)).toBe(false);
    expect(tooManyLinks(4)).toBe(true);
  });
  it("only allows relative callback URLs", () => {
    expect(safeCallbackUrl("/company/LMT")).toBe("/company/LMT");
    expect(safeCallbackUrl("https://evil.example")).toBe("/account");
    expect(safeCallbackUrl("//evil.example")).toBe("/account");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/account");
    expect(safeCallbackUrl(undefined, "/x")).toBe("/x");
  });
});
