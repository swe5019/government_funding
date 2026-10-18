import { describe, expect, it } from "vitest";
import { getProvider } from "@/lib/market-data";
import { mockProvider } from "@/lib/market-data/mock";
import { fillMonths, pctChange, summarizePeriods } from "@/lib/periods";
import { rulesToSql } from "@/lib/programs/rules";

const m = (iso: string, obligated: number) => ({ month: new Date(iso + "-01T00:00:00Z"), obligated });

describe("summarizePeriods", () => {
  const now = new Date("2026-11-15T12:00:00Z"); // Q4 2026: Oct, Nov so far

  it("compares the last 12 months with the 12 before", () => {
    const s = summarizePeriods([m("2026-11", 50), m("2025-12", 50), m("2025-11", 80), m("2024-12", 20), m("2024-11", 999)], now);
    expect(s.last12).toBe(100); // Dec 2025 - Nov 2026
    expect(s.prior12).toBe(100); // Dec 2024 - Nov 2025
    expect(s.last12Change).toBe(0);
  });

  it("compares quarter-to-date with the same months last year", () => {
    const s = summarizePeriods([m("2026-10", 30), m("2026-11", 30), m("2026-09", 500), m("2025-10", 40), m("2025-12", 999)], now);
    expect(s.quarterLabel).toBe("Q4 2026");
    expect(s.quarter).toBe(60);
    expect(s.quarterPriorYear).toBe(40);
    expect(s.quarterChange).toBeCloseTo(0.5);
  });

  it("returns null change without a positive prior period and handles de-obligations", () => {
    expect(summarizePeriods([m("2026-11", 10)], now).last12Change).toBeNull();
    expect(pctChange(10, -5)).toBeNull();
    expect(summarizePeriods([m("2026-11", -20), m("2025-11", 40)], now).last12Change).toBeCloseTo(-1.5);
  });

  it("fillMonths adds zero months across year boundaries", () => {
    const filled = fillMonths([m("2025-12", 5)], new Date("2025-11-01T00:00:00Z"), new Date("2026-01-20T00:00:00Z"));
    expect(filled.map((p) => [p.month.toISOString().slice(0, 7), p.obligated])).toEqual([
      ["2025-11", 0],
      ["2025-12", 5],
      ["2026-01", 0],
    ]);
  });
});

describe("market data", () => {
  it("mock prices are deterministic, weekday-only and consistent across ranges", async () => {
    const a = await mockProvider.getDailyBars("LMT", "2026-01-01", "2026-01-31");
    const b = await mockProvider.getDailyBars("lmt", "2025-06-01", "2026-01-31");
    expect(a.length).toBe(22);
    expect(a.every((x) => ![0, 6].includes(new Date(x.date + "T00:00:00Z").getUTCDay()))).toBe(true);
    expect(b.slice(-a.length)).toEqual(a);
    expect((await mockProvider.getDailyBars("MU", "2026-01-01", "2026-01-31"))[0].close).not.toBe(a[0].close);
  });

  it("never serves simulated prices in production, and is off when unset", () => {
    expect(getProvider({})).toBeNull();
    expect(getProvider({ MARKET_DATA_PROVIDER: "mock", NODE_ENV: "production" })).toBeNull();
    expect(getProvider({ MARKET_DATA_PROVIDER: "mock", NODE_ENV: "development" })?.isSimulated).toBe(true);
    expect(() => getProvider({ MARKET_DATA_PROVIDER: "nope" })).toThrow(/Unknown/);
  });
});

describe("rulesToSql", () => {
  it("ORs rules with numbered params", () => {
    const r = rulesToSql({ assistanceListings: ["11.037"], defCodes: ["Z"] }, 2);
    expect(r.sql).toBe(`a."assistanceListing" = ANY($2::text[]) OR a."defCodes" && $3::text[]`);
    expect(r.params).toEqual([["11.037"], ["Z"]]);
  });

  it("scopes keywords to agencies and escapes LIKE wildcards", () => {
    const r = rulesToSql({ keywords: ["50% off_"], agencyCodes: ["089"] });
    expect(r.sql).toContain(`a."awardingAgencyCode" = ANY($1::text[]) AND a.description ILIKE ANY($2::text[])`);
    expect(r.params[1]).toEqual(["%50\\% off\\_%"]);
  });

  it("rejects empty rules and unscoped keywords", () => {
    expect(() => rulesToSql({})).toThrow();
    expect(() => rulesToSql({ keywords: ["chips"] })).toThrow(/agencyCodes/);
  });
});
